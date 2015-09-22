'use strict';

var _ = require('lodash');
_.str = require('underscore.string');
var util = require('util');
var express = require('express');
var bodyParser = require('body-parser');
var onResponse = require('on-response');
var passport = require('passport');
var passportGoogleOauth = require('passport-google-oauth');
var fs = require('fs');
var cors = require('cors');
var expressSession = require('express-session');
var rethinkdbSession = require('session-rethinkdb')(expressSession);
var Attachments = require('./attachments')
var Promise = require('bluebird');


function ApiService(logger, db, rootUrl, scant_address, authInfo) {

    this._logger = logger;
    this._db = db;
    this._authInfo = authInfo;
    this._rootUrl = rootUrl;
    this._attachments = new Attachments(logger, scant_address);

    // create users
    this._users = {
        'some_guy@gmail.com': {}
    };

    this._initializeAuthentication();
    this._initializeExpress();
    this._initRoutes();
    this._initModels();

    this._logger.debug({scant_address: this._scant_address}, 'Initialized');
}

ApiService.prototype.listen = function(port) {

    var self = this;

    self._logger.info({port: port}, 'Listening')
    self._app.listen(port);
};

ApiService.prototype._initializeExpress = function() {

    var self = this;

    self._app = express();

    // support CORS before anything else
    self._app.use(cors({
        'origin': function(origin, callback) {

            // worry about this when it's relevant
            callback(null, true);
        },
        'credentials': true
    }));

    // parse json
    self._app.use(bodyParser.json({limit: '10mb'}));

    // parse url encoded params
    self._app.use(bodyParser.urlencoded({
        extended: true
    }));

    // log all requests and their responses
    self._app.use(function(request, response, next) {

        onResponse(request, response, function (error) {
            if (error)
                self._logger.error({request: request, response: response, error: error});
            else if (response.statusCode >= 200 && response.statusCode <= 299)
                self._logger.debug({request: request, response: response});
            else if (response.statusCode >= 500 && response.statusCode <= 599)
                self._logger.error({request: request, response: response});
            else
                self._logger.warn({request: request, response: response});
        });
        next();
    });

    self._app.use(expressSession({
        resave: true,
        saveUninitialized: true,
        secret: 'some retarded secret',
        store: rethinkdbSession({
            servers: [
                {host: 'localhost', port: 28015}
            ]
        })
    }));

    self._app.use(passport.initialize());
    self._app.use(passport.session());
};

ApiService.prototype._initModels = function() {
    var self = this;
    var type = self._db.type;

    var Supplier = self._db.createModel('suppliers', {
        name: type.string(),
        email: type.string(),
        phoneNumbers: [type.string()],
        createdAt: type.date().default(self._db.r.now())
    });

    var Quote = self._db.createModel('quotes', {
        delivery: type.string(),
        cost: type.number(),
        scanUrl: type.string(),
        supplierId: type.string(),
        createdAt: type.date().default(self._db.r.now())
    });

    var Invoice = self._db.createModel('invoices', {
        amount: type.number(),
        paidAt: type.date(),
        quoteId: type.string(),
        supplierId: type.string(),
        description: type.string(),
        createdAt: type.date().default(self._db.r.now())
    });

    self.User = self._db.createModel('users', {
        name: type.string(),
        email: type.string(),
        token: type.string(),
        lastLogin: type.date()
    });

    //
    // relations
    //

    Quote.belongsTo(Supplier, 'supplier', 'supplierId', 'id');
    Supplier.hasMany(Quote, 'quotes', 'id', 'supplierId');

    Invoice.belongsTo(Quote, 'quote', 'quoteId', 'id');
    Invoice.belongsTo(Supplier, 'supplier', 'supplierId', 'id');
    Quote.hasMany(Invoice, 'invoices', 'id', 'quoteId');

    //
    // register the routes for the resources
    //

    self._registerResourceRoutes('suppliers', Supplier);
    self._registerResourceRoutes('quotes', Quote);
    self._registerResourceRoutes('invoices', Invoice);

    //
    // Overridden events
    //

    Invoice.onBeforeCreate = function(model, request, response) {

        return new Promise(function(resolve, reject) {

            var createdResource = request.body;

            // does the resource have an "attachment" relationship? If so, we need to remove it and commit
            // this staged attachment
            if (createdResource.data.relationships && createdResource.data.relationships.attachment) {

                // remove the attachment from the object, it's not supposed to be stored as a relationship
                // in the database
                var attachment = createdResource.data.relationships.attachment;
                delete createdResource.data.relationships.attachment;

                // lets commit the attachment (creates a file for it in drive and returns info
                self._attachments.commit(request.user, attachment.data.id).spread(function (fileId, url, size, preview) {

                    // save the attachment file ID and URL
                    createdResource.data.attributes.attachment = {
                        fileId: fileId,
                        size: size,
                        url: url,
                        preview: preview
                    };

                    resolve(createdResource);

                }, function (error) {

                    self._logger.warn({error: error.message}, 'Failed to commit attachment');
                    reject(error);
                });
            } else {
                resolve(createdResource);
            }
        });
    };
};

ApiService.prototype._initRoutes = function() {

    var self = this;

    //
    // Authentication
    //

    self._app.get('/login', passport.authenticate('google', {
        scope: [
            'email',
            'https://www.googleapis.com/auth/drive'
        ]
    }));

    // callback from google
    self._app.get('/login/callback',
        passport.authenticate('google',
            {
                successRedirect : '/',
                failureRedirect : '/login'
            }));

    //
    // API
    //

    self._apiRouter = express.Router();

    // reject unauthenticated requests
    self._apiRouter.use(self._isLoggedInSendError.bind(self));

    // register to /api
    self._app.use('/api', self._apiRouter);

    // register attachment routes
    self._attachments.initRoutes(self._apiRouter);


    //
    // Catch all
    //

    // root access to the application
    self._app.route('/*').all(function(request, response)
    {
        response.sendStatus(403);
    });
};

ApiService.prototype._getModelJoins = function(model) {

    return model._joins;
};

ApiService.prototype._asArray = function(obj) {

    // undefined -> []
    if (obj) {
        if (!Array.isArray(obj)) {
            return [obj];
        } else {
            return obj;
        }
    } else {
        return [];
    }
};

ApiService.prototype._extractJoinedRecords = function(rootRecords, model, extractedRecords) {

    var self = this;

    // if root is not array, make it an array of one
    rootRecords = self._asArray(rootRecords);

    // get my joins
    var joins = self._getModelJoins(model);

    // iterate over all records in root
    _.forEach(rootRecords, function(rootRecord) {

        // iterate over all join fields
        _.forOwn(joins, function(joinInfo, joinField) {

            var joinedRecords = self._asArray(rootRecord[joinField]);

            // skip joins with no actual records attached
            if (joinedRecords.length) {

                // first, extract all of its joins
                self._extractJoinedRecords(joinedRecords, joinInfo.model, extractedRecords);

                // now shove all of our records into extracted records
                extractedRecords.push.apply(extractedRecords, joinedRecords);
            }
        });
    });
};

ApiService.prototype._getRecordAttributes = function(record, joins, fields) {

    var self = this;
    var attributes = {};

    // if the fields for the type have been selected, use only those fields
    if (fields) {

        // if the first field starts with "-", assume that all fields passed
        // are "except this field"
        if (fields[0].substring(0, 1) === '-') {

            // get the fields which should be excluded (remove "-" prefix)
            var excludedFields = _.map(fields, function(field) {
                return field.substring(1, field.length);
            });

            // build attributes (ugh)
            _.forOwn(record, function(value, key) {

                // set into attributes if not excluded
                if (excludedFields.indexOf(key) === -1)
                    attributes[key] = value;
            });

        } else {

            // take all fields specified by the fields
            _.forEach(fields, function(field) {
                attributes[field] = record[field];
            });
        }

    } else {
        _.forOwn(record, function(value, name) {

            // skip id and foreign keys
            if (name.localeCompare('id') != 0 &&
                !joins[name]) {
                attributes[name] = value;
            }
        });
    }

    return attributes;
};

ApiService.prototype._getResourceTypeByTableName = function(tableName) {

    var self = this;

    return tableName.substring(0, tableName.length - 1);
};

ApiService.prototype._serializeRecordsToResources = function(records, fieldsForTypes) {

    var self = this;
    var resources = [];

    records = self._asArray(records);

    _.forEach(records, function(record) {

        // get the joins for this type of record
        var joins = self._getModelJoins(record.getModel());

        // get the resource type
        var resourceType = self._getResourceTypeByTableName(record.getModel().getTableName());

        var resource = {
            type: resourceType,
            id: record.id,
            attributes: self._getRecordAttributes(record,
                joins,
                fieldsForTypes ? fieldsForTypes[resourceType] : undefined)
        };

        // iterate through the joins
        _.forOwn(joins, function(joinInfo, joinField) {

            // this may be overridden, so copy it
            var joinName = joinField;

            // get the join field name by join type
            if (joinInfo.type === 'belongsTo')
                joinField = joinInfo.leftKey;

            // iterate through relations
            _.forEach(self._asArray(record[joinField]), function(joinedRecordId) {

                // create relationships if doesn't already exist
                if (!resource.relationships)
                    resource.relationships = {};

                // the relationship to add
                var relationship = {
                    data: {
                        type: self._getResourceTypeByTableName(joinInfo.model.getTableName()),
                        id: joinedRecordId.id || joinedRecordId
                    }
                };

                // if this is a 1:1 join, just shove it as a key, otherwise add it to a list
                if (joinInfo.type === 'belongsTo') {

                    delete resource.attributes[joinField];
                    resource.relationships[joinName] = relationship;

                } else {

                    // create a field relationship (e.g. relationships: {quotes: []}) if it doesn't already exist
                    if (!resource.relationships[joinName])
                        resource.relationships[joinName] = [];

                    // shove a relationship element
                    resource.relationships[joinName].push(relationship);
                }
            });
        });

        resources.push(resource);
    });

    return resources;
};

ApiService.prototype._serialize = function(root, model, query) {

    var self = this;
    var encodedResponse = {};
    var joinedRecords = [];

    // get which fields we need to return for each type
    var fieldsForTypes = query.fields;

    // to make things simple, always work with an array
    root = self._asArray(root);

    // recurse into the tree, and flatten all joined records, keyed by their model
    self._extractJoinedRecords(root, model, joinedRecords);

    // remove duplicates (use only id)
    joinedRecords = _.uniq(joinedRecords, 'id');

    // iterate over all the joined records and _serialize them into resources, under "include"
    encodedResponse.included = self._serializeRecordsToResources(joinedRecords, fieldsForTypes);

    // iterate over roots, encode as a resource into the data
    encodedResponse.data = self._serializeRecordsToResources(root, fieldsForTypes);

    return encodedResponse;
};

// if name is 'x.y.z', and value is 5, context.x.y.z = 5
ApiService.prototype._setObjectProperties = function(name, value, context) {

    var self = this;
    var parts = name.split("."),
        p = parts.pop();

    for(var i = 0, j; context && (j = parts[i]); i++) {
        context = (j in context ? context[j] : context[j] = {});
    }

    return context && p ? (context[p] = value) : undefined;
};

// converts x.y -> {x: {y: true}}
ApiService.prototype._getJoinFromInclude = function(includes) {

    var self = this;
    var join = {};

    if (includes) {

        includes = includes.split(',');

        _.forEach(includes, function(include) {
            self._setObjectProperties(include, true, join);
        });
    }

    return join;
};

ApiService.prototype._parseQuery = function(query) {

    var self = this;
    var parsedQuery = {
        join: self._getJoinFromInclude(query.include),
        fields: {}
    };

    // iterate through filter, split fields
    _.forOwn(query.fields, function(value, type) {
        parsedQuery.fields[type] = value.split(',')
    });

    return parsedQuery;
};

//
// Routes
//

ApiService.prototype._handleGetList = function(model, req, res, next) {

    var self = this;
    var query = self._parseQuery(req.query);

    model.getJoin(query.join).run().then(function(matchingRecords) {

        res.json(self._serialize(matchingRecords, model, query));

    }).error(self._handleError(res));
};

ApiService.prototype._handleGetDetails = function(model, req, res, next) {

    var self = this;
    var query = self._parseQuery(req.query);

    model.get(req.params.id).getJoin(query.join).run().then(function(matchingRecord) {

        // don't pass a data array, just pass the data
        var resource = self._serialize(matchingRecord, model, query);
        if (resource.data.length) {
            resource.data = resource.data[0];
        }

        res.json(resource);

    }).error(self._handleError(res));
};

// this currently supports only 1:1 relationships
ApiService.prototype._deserializeResourceToRecord = function(model, resource) {

    // first, shove attributes
    var record = resource.data.attributes || {};

    // iterate through relationships, if any, and simply set [relationshipField]Id into the
    // resource
    _.forOwn(resource.data.relationships, function(relationship, relationshipName) {
        record[relationshipName + 'Id'] = relationship.data.id;
    });

    return record;
}

ApiService.prototype._handleCreate = function(model, req, res, next) {

    var self = this;

    model.onBeforeCreate(model, req, res).then(function(createdRecord) {

        var instance = new model(self._deserializeResourceToRecord(model, createdRecord));

        instance.save().then(function(createdRecord) {

            // TODO: for now, take the first element. However, may specify to _serializeRecordsToResources
            // how we want to receive the result in the future
            res.json({data: self._serializeRecordsToResources(createdRecord)[0]});
        });

    }).catch(self._handleError(res));
};

ApiService.prototype._handleUpdate = function(model, req, res, next) {

    var self = this;

    model.get(req.params.id).then(function(matchingRecord) {

        matchingRecord.merge(self._deserializeResourceToRecord(model, req.body)).save().then(function(updatedRecord) {

            res.sendStatus(204);
        });

    }).error(self._handleError(res));
};

ApiService.prototype._handleDelete = function(model, req, res, next) {

    var self = this;

    model.get(req.params.id).then(function(matchingRecord) {

        matchingRecord.delete().then(function(deletedRecord) {

            // if delete occurred successfully, saved flag should be turned off
            if (!deletedRecord.isSaved()) {
                res.sendStatus(204);
            } else {
                res.sendStatus(500);
            }
        })

    }).error(self._handleError(res));
}

ApiService.prototype._registerResourceEvents = function(model) {

    model.onBeforeCreate = function(model, request, response) {

        return new Promise(function(resolve, reject) {
            resolve(request.body);
        });
    }
}

ApiService.prototype._registerResourceRoutes = function(name, model) {

    var self = this;

    var root = util.format('/%s', name);

    self._apiRouter.get(root, function(req, res, next) {
        self._handleGetList(model, req, res, next);
    });

    self._apiRouter.get(root + '/:id', function(req, res, next) {
        self._handleGetDetails(model, req, res, next);
    });

    self._apiRouter.post(root, function(req, res, next) {
        self._handleCreate(model, req, res, next);
    });

    self._apiRouter.patch(root + '/:id', function(req, res, next) {
        self._handleUpdate(model, req, res, next);
    });

    self._apiRouter.delete(root + '/:id', function(req, res, next) {
        self._handleDelete(model, req, res, next);
    });

    self._registerResourceEvents(model);
};

ApiService.prototype._handleError = function(res) {

    var self = this;

    return function(error) {
        self._logger.warn({error: error.message}, 'Failed to handle request');
        return res.sendStatus(500, {error: error.message});
    }
};

//
// Auth
//

ApiService.prototype._verifyLoggedIn = function(request, response, errorScheme, next)
{
    var self = this;

    if (self._authInfo.bypass || request.isAuthenticated()) {
        return next();
    }
    else {
        if (errorScheme == 'redirect')
            response.redirect('/login');
        else
            response.sendStatus(401);
    }
};

ApiService.prototype._isLoggedInRedirect = function(request, response, next)
{
    var self = this;

    // check if logged in and redirect to /login otherwise
    return self._verifyLoggedIn(request, response, 'redirect', next);
}

ApiService.prototype._isLoggedInSendError = function(request, response, next)
{
    var self = this;

    // check if logged in and return error otherwise
    return self._verifyLoggedIn(request, response, 'error', next);
}

ApiService.prototype._getOauthInfo = function() {

    var self = this;

    return {
        clientID: self._authInfo.id,
        clientSecret: self._authInfo.secret,
        callbackURL: self._rootUrl + '/login/callback'
    };
};

ApiService.prototype._findUserByEmail = function(email) {

    var self = this;

    return new Promise(function(resolve, reject) {

        self.User.filter({email: email}).run().then(function(user) {

            if (!user || user.length !== 1)
                reject(new Error('Too many results or some other weirdness'));

            resolve(user[0]);

        }, reject);
    });
};

ApiService.prototype._onUserAuthentication = function(user, token, refreshToken) {

    var self = this;

    self._logger.debug({user: user.name}, 'User logged in');

    // update the user tokens
    user.token = token;
    user.refreshToken = refreshToken;
    user.lastLogin = new Date();

    return new Promise(function(resolve, reject) {

        // create application folder for user or get the ID if it exists
        self._attachments.getDirectoryId(user).then(function(folderId) {

            // save user authentication info and poverty id
            user.povertyFolderId = folderId;

            // save this to the database
            user.save().then(resolve, reject);

        }, reject);
    });
};

ApiService.prototype._initializeAuthentication = function() {

    var self = this;

    //
    // Passport user management
    //

    passport.serializeUser(function(user, done) {
        done(null, user.id);
    });

    passport.deserializeUser(function(id, done) {

        // find user by id
        self.User.get(id).run().then(function(user) {

            // report back
            done(null, user);

        }, done);
    });

    //
    // Login management
    //

    passport.use(new passportGoogleOauth.OAuth2Strategy(self._getOauthInfo(),
        function(token, refreshToken, profile, done) {

            // TODO: promise
            // find a user by email
            self._findUserByEmail(profile.emails[0].value).then(function(user) {

                // handle user login - will save tokens, create directory if needed
                self._onUserAuthentication(user, token, refreshToken).asCallback(done);

            }, done);
        })
    );
};

module.exports = ApiService;