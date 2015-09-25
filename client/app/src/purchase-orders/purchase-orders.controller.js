(function () {

    angular
        .module('poverty')
        .controller('PurchaseOrdersController', [
            '$rootScope', '$scope', 'ObjectDialogService', 'Restangular', 'ResourceCacheService', PurchaseOrdersController
        ]);

    function PurchaseOrdersController($rootScope, $scope, ObjectDialogService, Restangular, ResourceCacheService) {
        var vm = this;
        vm.order = 'attributes.createdAt';
        vm.resourceCache = ResourceCacheService;

        Restangular.all('purchaseOrders').getList({include: 'supplier'}).then(function (purchaseOrders) {
            ResourceCacheService.setResources('purchaseOrders', purchaseOrders);
        });

        $scope.$on('purchaseOrder.new', function () {
            vm.showDialog('add');
        });

        vm.onRecordClick = function ($event, purchaseOrder) {
            vm.showDialog('update', $event, purchaseOrder);
        };

        vm.showDialog = function (mode, $event, purchaseOrder) {

            var relationships = {
                supplier: {
                    type: 'supplier',
                    values: ResourceCacheService.getResources('suppliers')
                }
            };

            ObjectDialogService.show($event,
                'purchaseOrder',
                'purchase-orders',
                mode,
                purchaseOrder,
                vm.resourceCache.getResources('purchaseOrders'),
                relationships);
        };
    }
})();
