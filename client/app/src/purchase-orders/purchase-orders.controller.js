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

        function loadResources() {
            vm.resourceCache.loadResources('purchaseOrders', {
                'include': 'supplier',
                'fields[supplier]': 'name'
            });
        }

        $scope.$on('purchaseOrder.new', function () {
            vm.showDialog('add');
        });

        $scope.$on('purchaseOrder.show', function() {
            loadResources();
        });

        vm.onRecordClick = function ($event, purchaseOrder) {
            vm.showDialog('update', $event, purchaseOrder);
        };

        vm.showDialog = function (mode, $event, purchaseOrder) {

            // get a list of all suppliers (todo: can be cached somewhere)
            Restangular.all('suppliers').getList({'fields[supplier]': 'name'}).then(function(suppliers) {

                var relationships = {
                    supplier: {
                        type: 'supplier',
                        values: suppliers
                    }
                };

                ObjectDialogService.show($event,
                    'purchaseOrders',
                    './src/purchase-orders/purchase-orders.modal.tmpl.html',
                    mode,
                    purchaseOrder,
                    ResourceCacheService,
                    relationships).then(loadResources);
            });
        };
    }
})();
