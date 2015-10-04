(function () {
    'use strict';

    // Prepare the 'users' module for subsequent registration of controllers and delegates
    angular
        .module('poverty', ['md.data.table', 'restangular', 'ngMaterial', 'ngFileUpload'])
        .controller('PovertyController', [
            '$timeout', '$scope', '$log', '$q',
            PovertyController
        ])
        .config(['$mdThemingProvider', 'RestangularProvider', '$httpProvider',
            function ($mdThemingProvider, RestangularProvider, $httpProvider) {

                $mdThemingProvider.theme('docs-dark', 'default')
                    .primaryPalette('yellow')
                    .dark();

                function _initializeRestangular() {

                    var regexIso8601 = /^(\d{4}|\+\d{6})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})\.(\d{1,})(Z|([\-+])(\d{2}):(\d{2}))?)?)?)?$/;

                    RestangularProvider.setBaseUrl('http://poverty.localtunnel.me/api/');

                    // this is to set Access-Control-Allow-Credentials which apparently allows cookies in cross
                    // origin requests, otherwise each request set its own cookie and ignored the fact that
                    // there was a cookie for the API origin
                    RestangularProvider.setDefaultHttpFields({
                        withCredentials: true
                    });

                    // add a response interceptor
                    RestangularProvider.addResponseInterceptor(function (data, operation, what, url, response, deferred) {



                        if (data.data) {
                            var extractedData = data.data;
                            extractedData.meta = data.meta;
                            extractedData.included = data.included;

                            function _convertDateStringsToDates(input) {
                                // Ignore things that aren't objects.
                                if (typeof input !== "object") return input;

                                for (var key in input) {
                                    if (!input.hasOwnProperty(key)) continue;

                                    var value = input[key];
                                    var match;
                                    // Check for string properties which look like dates.
                                    if (typeof value === "string" && (match = value.match(regexIso8601))) {
                                        var milliseconds = Date.parse(match[0])
                                        if (!isNaN(milliseconds)) {
                                            input[key] = new Date(milliseconds);
                                        }
                                    } else if (typeof value === "object") {
                                        // Recurse into object
                                        _convertDateStringsToDates(value);
                                    }
                                }
                            }

                            // call fn on any leaf of the object with a "type"
                            function _callOnTypedElements(elem, fn) {
                                if (elem !== undefined) {

                                    // if the element has a "type" member, apply the function
                                    if (elem.type !== undefined) {
                                        fn(elem);

                                    // otherwise, iterate over the elements members recursively and look to apply
                                    // the function on its members
                                    } else {
                                        _.forOwn(elem, function(el) {
                                            _callOnTypedElements(el, fn);
                                        });
                                    }
                                }
                            }

                            function _attachInclusionFunction(elem) {
                                elem.getIncluded = function () {
                                    return _.find(extractedData.included, function (included) {
                                        return (included.type == elem.type) && (included.id == elem.id);
                                    });
                                };
                            }

                            // for all elements with a "type" field in data, attach a function on its relationships
                            // to get the actual data
                            _callOnTypedElements(data.data, function (elem) {
                                _callOnTypedElements(elem.relationships, _attachInclusionFunction);
                            });

                            // look for dates and convert them
                            _convertDateStringsToDates(data.data);

                            return extractedData;

                        } else {
                            return data;
                        }
                    });
                }

                _initializeRestangular();
                // _initializeInterceptor();

                // intercept any 401 responses to keep the user logged in
                $httpProvider.interceptors.push(['$rootScope', '$q',
                    function ($rootScope, $q) {
                        return {
                            responseError: function (rejection) {

                                if (rejection.status === 401) {
                                    window.location = "http://poverty.localtunnel.me/login";
                                } else {
                                    return $q.reject(rejection);
                                }
                            }
                        };
                    }]);
            }]);

    function PovertyController($timeout, $scope, $log, $q) {
        var vm = this;

        vm.menuButtons = [
            {
                label: 'Supplier',
                icon: 'ion-person',
                event: 'supplier.new'
            },
            {
                label: 'Purchase Order',
                icon: 'ion-document-text',
                event: 'purchaseOrder.new'
            },
            {
                label: 'Payment',
                icon: 'ion-social-usd',
                event: 'payment.new'
            }
        ];

        vm.onMenuItemClick = function (button) {
            var vm = this;

            $scope.$broadcast(button.event);
        };

        /* $timeout(function() {
            $scope.$broadcast('payment.new');
        }, 1000); */
    }
})();