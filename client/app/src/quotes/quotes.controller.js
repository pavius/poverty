(function(){

  angular
       .module('poverty')
       .controller('QuotesController', [
          '$rootScope', '$scope', 'ObjectDialogService', 'Restangular', 'ResourceCacheService', QuotesController
       ]);

  function QuotesController($rootScope, $scope, ObjectDialogService, Restangular, ResourceCacheService) {
    var vm = this;
    vm.order = 'attributes.createdAt';
    vm.resourceCache = ResourceCacheService;

    Restangular.all('quotes').getList({include: 'supplier'}).then(function(quotes) {
      ResourceCacheService.setResources('quotes', quotes);
    });

    $scope.$on('quote.new', function() {
        vm.showDialog('add');
    });

    vm.onRecordClick = function($event, quote) {
      vm.showDialog('update', $event, quote);
    };

    vm.showDialog = function(mode, $event, quote) {

      var relationships = {
        supplier: {
          type: 'supplier',
          values: ResourceCacheService.getResources('suppliers')
        }
      };

      ObjectDialogService.show($event,
        'quote',
        mode,
        quote,
        vm.resourceCache.getResources('quotes'),
        relationships);
    };
  }
})();
