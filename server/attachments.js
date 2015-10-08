'use strict';

var _ = require('lodash');
var request = require('request');
var Promise = require('bluebird');
var uuid = require('node-uuid');
var google = require('googleapis');
var PDFImage = require("pdf-image").PDFImage;
var tmp = require('tmp');
var fs = require('fs');
var refresh = require('passport-oauth2-refresh');


function Attachments(logger, scant_address) {

    this._logger = logger;
    this._scant_address = scant_address;
    this._stagedAttachments = {};
}

Attachments.prototype.getDirectoryId = function(user) {

    var self = this;

    self._logger.debug({user: user.name}, 'Getting poverty folder');

    return new Promise(function(resolve, reject) {

        // look for the poverty application directory
        self._callGoogleApi(user, 'drive.files.list', {
            q: 'title = ".poverty"'
        }).then(function(resource) {

            // did we find a file?
            if (resource.items.length === 0) {

                self._logger.debug('Poverty folder doesn\'t exist, creating');

                self._callGoogleApi(user, 'drive.files.insert', {
                    resource: {
                        title: '.poverty',
                        mimeType: 'application/vnd.google-apps.folder'
                    }
                }).then(function(resource) {

                    self._logger.debug({id: user.povertyFolderId}, 'Poverty folder created');
                    return resolve(resource.id);
                }, reject);

            // poverty folder exists
            } else {

                // is there more than one poverty folder for some reason?
                if (resource.items.length > 1) {
                    self._logger.warn('Several poverty folders exist, using first');
                }

                self._logger.debug({id: user.povertyFolderId}, 'Poverty folder exists');
                return resolve(resource.items[0].id);
            }
        }, reject);
    });
};

Attachments.prototype.commit = function(user, stagedAttachmentId) {

    var self = this;

    return new Promise(function(resolve, reject) {

        var stagedAttachment = self._stagedAttachments[stagedAttachmentId];

        if (!stagedAttachment)
            return reject(new Error('Staged attachment doesn\'t exist'));

        // upload this to google drive
        self._callGoogleApi(user, 'drive.files.insert', {
            resource: {
                parents: [{
                    "kind": "drive#fileLink",
                    "id": user.povertyFolderId
                }],
                title: stagedAttachment.title,
                description: "Nothing yet"
            },
            media: {
                mimeType: stagedAttachment.contentType,
                body: stagedAttachment.media
            }
        }).then(function(resource) {

            self._logger.debug({id: resource.id}, 'File created successfully on Google Drive');

            // destage attachment
            delete self._stagedAttachments[stagedAttachmentId];

            // we're done
            return resolve([resource.id, resource.alternateLink, resource.fileSize, stagedAttachment.preview]);
        }, reject);
    });
};

Attachments.prototype.initRoutes = function(router) {

    var self = this;

    router.post('/attachments', function(request, response, next) {

        self._create(request.user, request.body.data.attributes).then(function(attachment) {

            response.status(201).json({
                data: {
                    id: attachment.id,
                    type: 'attachment',
                    attributes: {
                        preview: attachment.preview
                    }
                }
            });

        }, function(error) {

            response.sendStatus(500);
        });
    });
};

Attachments.prototype._callGoogleApi = function(user, apiName, params, dontRetry) {

    var self = this;

    return new Promise(function(resolve, reject) {

        // get the api function by name so that we can call it
        var apiFunction = _.get(self._getGoogleApi(user), apiName);

        // call the api
        apiFunction(params, function(error, resource) {

            // was there an error in the request?
            if (error) {

                // was the error an issue with authentication?
                if (error.code === 401 && !dontRetry) {

                    self._logger.debug('Google returned authentication error, refreshing token');

                    // refresh the token, trigger a save to the creds and then re-call the request
                    // if it fails, don't try again (perhaps use "retry" flag or something)
                    refresh.requestNewAccessToken('google', user.refreshToken, function(error, accessToken) {

                        if (error || !accessToken) {

                            self._logger.warn({error: error.message}, 'Failed to refresh Google token');
                            reject(error);
                        }

                        self._logger.debug('Token refreshed successfully, saving in user');

                        // clear the google api object, so that it will be created next time
                        self._googleApi = null;

                        // update teh access token both in googleApi and in the user
                        user.accessToken = accessToken;

                        // update the user in teh database
                        user.save().then(function() {

                            self._logger.debug('New access token saved in user');

                            // retry the request
                            self._callGoogleApi(user, apiName, params, true).then(resolve, reject);

                        }, reject);
                    });

                // not an authentication problem
                } else return reject(error);

            } else {

                // request was successful (after re-auth, perhaps), return the response
                resolve(resource);
            }
        });
    });
};

Attachments.prototype._createPreview = function(buffer) {

    return new Promise(function(resolve, reject) {

        // first we need to save to a file because that's how the pdf thingie works
        tmp.file(function(err, path, fd, deleteTempFile) {

            if (err)
                return reject(err);

            // write the buffer to the file
            fs.write(fd, buffer, 0, buffer.length, function(err, written, buffer) {

                if (err) {
                    deleteTempFile();
                    return reject(err);
                }

                // load the pdf and covert the PDF
                var pdfImage = new PDFImage(path, {
                    convertExtension: 'jpeg',
                    convertOptions: {'-resize': '50%'}
                });
                pdfImage.convertPage(0).then(function(previewImagePath) {

                    // read the file
                    fs.readFile(previewImagePath, function(err, previewImageBuffer) {

                        // delete the preview image since we already loaded to buffer
                        deleteTempFile();
                        fs.unlink(previewImagePath);

                        // return the preview
                        resolve(previewImageBuffer.toString('base64'));
                    });

                }, function(error) {
                    deleteTempFile();
                    reject(error);
                });
            });
        });
    });
};

Attachments.prototype._create = function(user, attributes) {

    var self = this;

    return new Promise(function(resolve, reject) {

        self._getMedia(attributes).spread(function(media, contentType) {

            self._createPreview(media).then(function(previewImage) {

                // create an attachment object
                var attachmentId = uuid.v4();
                var attachment = {
                    id: attachmentId,
                    user: user,
                    media: media,
                    contentType: contentType,
                    length: media.length,
                    title: attributes.title,
                    preview: previewImage
                };

                self._logger.debug({id: attachmentId}, 'Staged attachment created');

                // shove to attachments
                self._stagedAttachments[attachmentId] = attachment;

                // resolve with the attachment
                resolve(attachment);

            }, function(error) {

                self._logger.debug({error: error.message}, 'Failed to create preview');
                reject(error);
            });
        });
    });
};

Attachments.prototype._getGoogleApi = function(user) {

    var self = this;

    // have we created it yet?
    if (!self._googleApi) {

        self._googleApi = {};

        // create an oauth client with pre-loaded tokens
        var oauth2Client = new google.auth.OAuth2();
        oauth2Client.credentials = {
            access_token: user.accessToken,
            refresh_token: user.refreshToken
        };

        // build API
        self._googleApi.drive = google.drive({version: 'v2', auth: oauth2Client});
    }

    return self._googleApi;
}

Attachments.prototype._getMedia = function(attributes) {

    var self = this;

    return new Promise(function(resolve, reject) {

        // if this is a scan, we need to trigger it
        if (attributes.type === 'scan') {

            self._logger.debug('Submitting scan request');

            // create the scan, using a scant service
            request.post(self._scant_address + '/scans',
                {encoding: null},
                function (error, response, scanBody) {

                if (error || response.statusCode !== 200) {
                    self._logger.warn({error: error.message}, 'Scant returned error');
                    return reject(error);
                }

                self._logger.debug({size: scanBody.length}, 'Scan received successfully');

                resolve([scanBody, 'application/pdf']);
            });

        // uploaded
        } else {

            self._logger.debug({size: attributes.contents.length, contentType: attributes.contentType}, 'Uploaded media received successfully');

            // just return the media immediately
            resolve([new Buffer(attributes.contents, 'base64'), attributes.contentType]);
        }
    });
};

module.exports = Attachments;