'use strict';

var request = require('request');
var Promise = require('bluebird');
var uuid = require('node-uuid');
var google = require('googleapis');
var PDFImage = require("pdf-image").PDFImage;
var tmp = require('tmp');
var fs = require('fs');


function Attachments(logger, scant_address) {

    this._logger = logger;
    this._scant_address = scant_address;
    this._stagedAttachments = {};
}

Attachments.prototype.getDirectoryId = function(user) {

    var self = this;

    self._logger.debug({user: user.name}, 'Getting poverty folder');

    // create the google api for the user, using the credentials stored in user
    var googleApi = self._createGoogleApi(user);

    return new Promise(function(resolve, reject) {

        // look for the poverty application directory
        googleApi.drive.files.list({
            q: 'title = ".poverty"'
        }, function (error, resource) {

            // check if we failed to list files which match ".poverty"
            if (error) {
                self._logger.debug({error: error.message}, 'Failed to list folders');
                return reject(error);
            }

            // did we find a file?
            if (resource.items.length === 0) {

                self._logger.debug('Poverty folder doesn\'t exist, creating');

                // create a directory called ".poverty" at the root
                googleApi.drive.files.insert({
                    resource: {
                        title: '.poverty',
                        mimeType: 'application/vnd.google-apps.folder'
                    }
                }, function (error, resource) {

                    // check if we failed to create the dire3ctory
                    if (error) {
                        self._logger.warn({error: error.message}, 'Failed to create poverty folder');
                        return reject(error);
                    }

                    self._logger.debug({id: user.povertyFolderId}, 'Poverty folder created');
                    return resolve(resource.id);
                });

            // poverty folder exists
            } else {

                // is there more than one poverty folder for some reason?
                if (resource.items.length > 1) {
                    self._logger.warn('Several poverty folders exist, using first');
                }

                self._logger.debug({id: user.povertyFolderId}, 'Poverty folder exists');
                return resolve(resource.items[0].id);
            }
        });
    });
};

Attachments.prototype.commit = function(user, stagedAttachmentId) {

    var self = this;

    return new Promise(function(resolve, reject) {

        var stagedAttachment = self._stagedAttachments[stagedAttachmentId];

        if (!stagedAttachment)
            return reject(new Error('Staged attachment doesn\'t exist'));

        // upload this to google drive
        self._createGoogleApi(user).drive.files.insert({
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
        }, function(error, resource) {

            if (error) {
                self._logger.warn({error: error.message}, 'Failed to write scan');
                return reject(error);
            }

            self._logger.debug({id: resource.id}, 'Scan submitted successfully');

            // destage attachment
            delete self._stagedAttachments[stagedAttachmentId];

            // we're done
            return resolve([resource.id, resource.alternateLink, resource.fileSize, stagedAttachment.preview]);
        });
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

                self._logger.debug('Failed to get media from scant');
                reject(error);
            });
        });
    });
};

Attachments.prototype._createGoogleApi = function(user) {

    var self = this;
    var googleApi = {};

    // create an oauth client with pre-loaded tokens
    var oauth2Client = new google.auth.OAuth2();
    oauth2Client.credentials = {
        access_token: user.token,
        refresh_token: user.refreshToken
    };

    // build API
    googleApi.drive = google.drive({version: 'v2', auth: oauth2Client});

    return googleApi;
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

            self._logger.debug({size: attributes.media.length}, 'Uploaded media received successfully');

            // just return the media immediately
            resolve([attributes.media, attributes.contentType]);
        }
    });
};

module.exports = Attachments;