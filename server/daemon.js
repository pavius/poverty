'use strict';

var bunyan = require('bunyan');
var ApiService = require('./api_service');
var config = require('./config.js');

function initializeLogger(daemon) {

    function serializeRequest(request) {
        return {method: request.method, url: request.url, body: request.body}
    };

    function serializeResponse(response) {
        return {status: response.statusCode || response.status}
    };

    daemon.logger = bunyan.createLogger({
        name: 'poverty',
        level: process.env.POVERTY_LOG_LEVEL || 'debug',
        serializers: {request: serializeRequest, response: serializeResponse}});
}

function initialize(daemon) {

    // initialize logging
    initializeLogger(daemon);
    daemon.logger.info('Initializing daemon');

    // Import rethinkdbdash
    var thinky = require('thinky')(config.rethinkdb);

    // get auth info
    var authInfo = {
        bypass: true || process.env.NODE_ENV == 'development' || process.env.NODE_ENV == 'test',
        id: process.env.POVERTY_CLIENT_ID || 'local',
        secret: process.env.POVERTY_CLIENT_SECRET || 'local'
    };

    // create service instance
    daemon.service = new ApiService(daemon.logger,
        thinky,
        config.poverty.rootUrl,
        config.scant.url,
        authInfo);
}

var daemon = {}

// initialize daemon
initialize(daemon);

// start listening
daemon.service.listen(parseInt(process.env.POVERTY_LISTEN_PORT) || config.poverty.port);
