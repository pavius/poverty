(function(){

  angular
       .module('poverty')
       .controller('QuotesController', [
          '$rootScope', '$scope', 'ObjectDialogService', 'Restangular', QuotesController
       ]);

  function QuotesController($rootScope, $scope, ObjectDialogService, Restangular) {
    var vm = this;
    vm.order = 'attributes.createdAt';
    $rootScope.quotes = {};

    Restangular.all('quotes').getList({include: 'supplier'}).then(function(quotes) {
      $rootScope.quotes = quotes;
    });

    $scope.$on('quote.new', function() {
        vm.showDialog('add');
    });

    vm.onRecordClick = function($event, quote) {
      vm.showDialog('update', $event, quote);
    };

    vm.getSupplierById = function(id) {

      for (var supplierIdx = 0; supplierIdx < $rootScope.suppliers.length; ++supplierIdx)
        if ($rootScope.suppliers[supplierIdx].id === id)
          return $rootScope.suppliers[supplierIdx];
    };

    vm.showDialog = function(mode, $event, quote) {

      var relationships = {
        supplier: {
          type: 'supplier',
          values: $rootScope.suppliers
        }
      };

      ObjectDialogService.show($event,
        'quote',
        mode,
        quote,
        $rootScope.quotes,
        relationships);
    };
  }
})();
