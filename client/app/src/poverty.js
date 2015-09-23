(function(){
  'use strict';

    // Prepare the 'users' module for subsequent registration of controllers and delegates
    angular
        .module('poverty', [ 'md.data.table', 'restangular', 'ngMaterial' ])
        .controller('PovertyController', [
            '$timeout', '$scope', '$log', '$q',
            PovertyController
        ])
        .config(['$mdThemingProvider', 'RestangularProvider', '$httpProvider',
          function($mdThemingProvider, RestangularProvider, $httpProvider) {

            $mdThemingProvider.theme('docs-dark', 'default')
              .primaryPalette('yellow')
              .dark();

            function _initializeRestangular() {

              RestangularProvider.setBaseUrl('http://poverty.localtunnel.me/api/');

              // this is to set Access-Control-Allow-Credentials which apparently allows cookies in cross
              // origin requests, otherwise each request set its own cookie and ignored the fact that
              // there was a cookie for the API origin
              RestangularProvider.setDefaultHttpFields({
                  withCredentials: true
              });

              // add a response interceptor
              RestangularProvider.addResponseInterceptor(function(data, operation, what, url, response, deferred) {

                if (data.data) {
                  var extractedData = data.data;
                  extractedData.meta = data.meta;
                  extractedData.included = data.included;

                  function _apply(elem, fct) {
                    if (elem !== undefined){
                      if (elem.type !== undefined) {
                        fct(elem);
                      } else {
                        _.forEach(elem, function(el) {
                          _apply(el, fct);
                        });
                      }
                    }
                  }

                  _apply(data.data, function(elem) {
                    _apply(elem.relationships, function(rel) {
                      rel.getIncluded = function(){
                        return _.find(extractedData.included, function(included) {
                          return (included.type == rel.type) && (included.id == rel.id);
                        });
                      };
                    });
                  });

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
              function($rootScope, $q) {
                return {
                    responseError: function(rejection) {

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
            label: 'Quote',
            icon: 'ion-document-text',
            event: 'quote.new'
          },
          {
            label: 'Invoice',
            icon: 'ion-social-usd',
            event: 'invoice.new'
          }
        ];

        vm.onMenuItemClick = function(button) {
            var vm = this;

            $scope.$broadcast(button.event);
        }

        /* $timeout(function() {
          $scope.$broadcast('invoice.new');
        }, 1000); */
    }
})();