(function(){

  angular
       .module('poverty')
       .controller('SuppliersController', [
          '$rootScope', '$scope', 'ObjectDialogService', 'Restangular', SuppliersController
       ]);

  function SuppliersController($rootScope, $scope, ObjectDialogService, Restangular) {

    var vm = this;
    vm.order = 'attributes.createdAt'
    $rootScope.suppliers = {};

    Restangular.all('suppliers').getList().then(function(suppliers) {
      $rootScope.suppliers = suppliers;
    });

    $scope.$on('supplier.new', function() {
        vm.showDialog('add');
    });

    vm.onRecordClick = function($event, supplier) {
      vm.showDialog('update', $event, supplier);
    }

    vm.showDialog = function(mode, $event, supplier) {

      ObjectDialogService.show($event,
        'supplier',
        mode,
        supplier,
        $rootScope.suppliers);
    }
  }
})();
