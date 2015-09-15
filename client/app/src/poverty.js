(function(){
  'use strict';

    // Prepare the 'users' module for subsequent registration of controllers and delegates
    angular
        .module('poverty', [ 'md.data.table', 'restangular', 'ngMaterial' ])
        .controller('PovertyController', [
            '$scope', '$log', '$q',
            PovertyController
        ])
        .config(['$mdThemingProvider', 'RestangularProvider', '$httpProvider',
          function($mdThemingProvider, RestangularProvider, $httpProvider) {

            $mdThemingProvider.theme('docs-dark', 'default')
              .primaryPalette('yellow')
              .dark();

            //
            RestangularProvider.setBaseUrl('http://poverty.localtunnel.me/');

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
        }]);

    function PovertyController($scope, $log, $q) {
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
    }
})();