(function(){

  angular
       .module('poverty')
       .controller('InvoicesController', [
          '$rootScope', '$scope', 'ObjectDialogService', 'Restangular', InvoicesController
       ]);

  function InvoicesController($rootScope, $scope, ObjectDialogService, Restangular) {
    var vm = this;
    vm.order = 'attributes.createdAt';
    $rootScope.invoices = {};

    Restangular.all('invoices').getList({include: 'quote'}).then(function(invoices) {
      $rootScope.invoices = invoices;
    });

    $scope.$on('invoice.new', function() {
        vm.showDialog('add');
    });

    vm.onRecordClick = function($event, invoice) {
      vm.showDialog('update', $event, invoice);
    };

    vm.getSupplierById = function(id) {

      for (var supplierIdx = 0; supplierIdx < $rootScope.suppliers.length; ++supplierIdx)
        if ($rootScope.suppliers[supplierIdx].id === id)
          return $rootScope.suppliers[supplierIdx];
    };

    vm.getQuoteById = function(id) {

      for (var quoteIdx = 0; quoteIdx < $rootScope.quotes.length; ++quoteIdx)
        if ($rootScope.quotes[quoteIdx].id === id)
          return $rootScope.quotes[quoteIdx];
    };

    vm.showDialog = function(mode, $event, invoice) {

      var self = this;

      // create a modal controller, to be used as an extension
      function CustomController() {

        var vm = this;

        vm.scan = function() {
          Restangular.one('invoices', 30).all('scans').post({
            data: {
              attributes: {
                name: "from UI"
              }
            }
          }).then(function(resource) {

            console.log(resource);
          }, function(error) {

            console.log(error);
          });
        }
      }

      var relationships = {
        quote: {
          type: 'quote',
          values: $rootScope.quotes
        }
      };

      ObjectDialogService.show($event,
        'invoice',
        mode,
        invoice,
        $rootScope.invoices,
        relationships,
        CustomController);
    };
  }
})();
