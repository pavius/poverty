'use strict';

var bunyan = require('bunyan');
var ApiService = require('./api_service');
var config = require('./config.js');

function initializeLogger(daemon) {

    function serializeRequest(request) {
        return {method: request.method, url: request.url}
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

    // create service instance
    daemon.service = new ApiService(daemon.logger, thinky);
}

var daemon = {}

// initialize daemon
initialize(daemon);

// start listening
daemon.service.listen(parseInt(process.env.POVERTY_LISTEN_PORT) || config.express.port);
