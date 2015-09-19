(function(){

  angular
       .module('poverty')
       .controller('SuppliersController', [
          '$rootScope', '$scope', 'ObjectDialogService', 'Restangular', 'ResourceCacheService', SuppliersController
       ]);

  function SuppliersController($rootScope, $scope, ObjectDialogService, Restangular, ResourceCacheService) {

    var vm = this;
    vm.order = 'attributes.createdAt';
    vm.resourceCache = ResourceCacheService;

    Restangular.all('suppliers').getList().then(function(suppliers) {
      ResourceCacheService.setResources('suppliers', suppliers);
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
        ResourceCacheService.getResources('suppliers'));
    }
  }
})();
