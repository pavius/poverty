'use strict';

var _ = require('lodash');
_.str = require('underscore.string');
var util = require('util');
var express = require('express');
var bodyParser = require('body-parser');
var onResponse = require('on-response');

function ApiService(logger, db) {

    this._logger = logger;
    this._db = db;

    this._initializeExpress();
    this._initModels();
    this._initRoutes();
}

ApiService.prototype.listen = function(port) {

    this._logger.info({port: port}, 'Listening')
    this.app.listen(port);
};

ApiService.prototype._initializeExpress = function() {

    var self = this;

    self.app = express();

    // parse json
    self.app.use(bodyParser.json({limit: '10mb'}));

    // parse url encoded params
    self.app.use(bodyParser.urlencoded());

    // log all requests and their responses
    self.app.use(function(request, response, next) {

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
        scanUrl: type.string(),
        paidAt: type.date(),
        quoteId: type.string(),
        supplierId: type.string(),
        createdAt: type.date().default(self._db.r.now())
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
    self.registerResourceRoutes('suppliers', Supplier);
    self.registerResourceRoutes('quotes', Quote);
    self.registerResourceRoutes('invoices', Invoice);
};


ApiService.prototype._initRoutes = function() {

    var self = this;

    // route everything that hasn't been caught
    self.app.route('/*').all(function(request, response) {

        response.status(403).end();
    });
};

ApiService.prototype.getModelJoins = function(model) {

    return model._joins;
};

ApiService.prototype.asArray = function(obj) {

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

ApiService.prototype.extractJoinedRecords = function(rootRecords, model, extractedRecords) {

    var self = this;

    // if root is not array, make it an array of one
    rootRecords = self.asArray(rootRecords);

    // get my joins
    var joins = self.getModelJoins(model);

    // iterate over all records in root
    _.forEach(rootRecords, function(rootRecord) {

        // iterate over all join fields
        _.forOwn(joins, function(joinInfo, joinField) {

            var joinedRecords = self.asArray(rootRecord[joinField]);

            // skip joins with no actual records attached
            if (joinedRecords.length) {

                // first, extract all of its joins
                self.extractJoinedRecords(joinedRecords, joinInfo.model, extractedRecords);

                // now shove all of our records into extracted records
                extractedRecords.push.apply(extractedRecords, joinedRecords);
            }
        });
    });
};

ApiService.prototype.getRecordAttributes = function(record, joins, fields) {

    var self = this;
    var attributes = {};

    // if the fields for the type have been selected, use only those fields
    if (fields) {

        _.forEach(fields, function(field) {
            attributes[field] = record[field];
        })

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

ApiService.prototype.getResourceTypeByTableName = function(tableName) {

    var self = this;

    return tableName.substring(0, tableName.length - 1);
};

ApiService.prototype.serializeRecordsToResources = function(records, fieldsForTypes) {

    var self = this;
    var resources = [];

    records = self.asArray(records);

    _.forEach(records, function(record) {

        // get the joins for this type of record
        var joins = self.getModelJoins(record.getModel());

        // get the resource type
        var resourceType = self.getResourceTypeByTableName(record.getModel().getTableName());

        var resource = {
            type: resourceType,
            id: record.id,
            attributes: self.getRecordAttributes(record,
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
            _.forEach(self.asArray(record[joinField]), function(joinedRecordId) {

                // create relationships if doesn't already exist
                if (!resource.relationships)
                    resource.relationships = {};

                // the relationship to add
                var relationship = {
                    data: {
                        type: self.getResourceTypeByTableName(joinInfo.model.getTableName()),
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

ApiService.prototype.serialize = function(root, model, query) {

    var self = this;
    var encodedResponse = {};
    var joinedRecords = [];

    // get which fields we need to return for each type
    var fieldsForTypes = query.fields;

    // to make things simple, always work with an array
    root = self.asArray(root);

    // recurse into the tree, and flatten all joined records, keyed by their model
    self.extractJoinedRecords(root, model, joinedRecords);

    // remove duplicates (use only id)
    joinedRecords = _.uniq(joinedRecords, 'id');

    // iterate over all the joined records and serialize them into resources, under "include"
    encodedResponse.included = self.serializeRecordsToResources(joinedRecords, fieldsForTypes);

    // iterate over roots, encode as a resource into the data
    encodedResponse.data = self.serializeRecordsToResources(root, fieldsForTypes);

    return encodedResponse;
};

// if name is 'x.y.z', and value is 5, context.x.y.z = 5
ApiService.prototype.setObjectProperties = function(name, value, context) {

    var self = this;
    var parts = name.split("."),
        p = parts.pop();

    for(var i = 0, j; context && (j = parts[i]); i++) {
        context = (j in context ? context[j] : context[j] = {});
    }

    return context && p ? (context[p] = value) : undefined;
};

// converts x.y -> {x: {y: true}}
ApiService.prototype.getJoinFromInclude = function(includes) {

    var self = this;
    var join = {};

    if (includes) {

        includes = includes.split(',');

        _.forEach(includes, function(include) {
            self.setObjectProperties(include, true, join);
        });
    }

    return join;
};

ApiService.prototype.parseQuery = function(query) {

    var self = this;
    var parsedQuery = {
        join: self.getJoinFromInclude(query.include),
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

ApiService.prototype.handleGetList = function(model, req, res, next) {

    var self = this;
    var query = self.parseQuery(req.query);

    model.getJoin(query.join).run().then(function(matchingRecords) {

        res.json(self.serialize(matchingRecords, model, query));

    }).error(self.handleError(res));
};

ApiService.prototype.handleGetDetails = function(model, req, res, next) {

    var self = this;
    var query = self.parseQuery(req.query);

    model.get(req.params.id).getJoin(query.join).run().then(function(matchingRecord) {

        // don't pass a data array, just pass the data
        var resource = self.serialize(matchingRecord, model, query);
        if (resource.data.length) {
            resource.data = resource.data[0];
        }

        res.json(resource);

    }).error(self.handleError(res));
};

// this currently supports only 1:1 relationships
function deserializeResourceToRecord(model, resource) {

    // first, shove attributes
    var record = resource.data.attributes;

    // iterate through relationships, if any, and simply set [relationshipField]Id into the
    // resource
    _.forOwn(resource.data.relationships, function(relationship, relationshipName) {
        record[relationshipName + 'Id'] = relationship.data.id;
    });

    return record;
}

ApiService.prototype.handleCreate = function(model, req, res, next) {

    var self = this;
    var instance = new model(deserializeResourceToRecord(model, req.body));

    instance.save().then(function(createdRecord) {

        // TODO: for now, take the first element. However, may specify to serializeRecordsToResources
        // how we want to receive the result in the future
        res.json({data: self.serializeRecordsToResources(createdRecord)[0]});

    }).error(self.handleError(res));
};

ApiService.prototype.handleUpdate = function(model, req, res, next) {

    var self = this;

    model.get(req.params.id).then(function(matchingRecord) {

        matchingRecord.merge(deserializeResourceToRecord(model, req.body)).save().then(function(updatedRecord) {

            res.sendStatus(204);
        });

    }).error(self.handleError(res));
};

ApiService.prototype.handleDelete = function(model, req, res, next) {

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

    }).error(self.handleError(res));
}

ApiService.prototype.registerResourceRoutes = function(name, model) {

    var self = this;
    var root = util.format('/%s', name);

    self.app.route(root).get(function(req, res, next) {
        self.handleGetList(model, req, res, next);
    });

    self.app.route(root + '/:id').get(function(req, res, next) {
        self.handleGetDetails(model, req, res, next);
    });

    self.app.route(root).post(function(req, res, next) {
        self.handleCreate(model, req, res, next);
    });

    self.app.route(root + '/:id').patch(function(req, res, next) {
        self.handleUpdate(model, req, res, next);
    });

    self.app.route(root + '/:id').delete(function(req, res, next) {
        self.handleDelete(model, req, res, next);
    });
};

ApiService.prototype.handleError = function(res) {
    return function(error) {
        return res.send(500, {error: error.message});
    }
};

module.exports = ApiService;