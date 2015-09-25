(function () {

    angular
        .module('poverty')
        .controller('SuppliersController', [
            '$rootScope', '$scope', 'CategoriesService', 'ObjectDialogService',
            'Restangular', 'ResourceCacheService', SuppliersController
        ]);

    function SuppliersController($rootScope, $scope, CategoriesService, ObjectDialogService, Restangular, ResourceCacheService) {

        var vm = this;
        vm.order = 'attributes.createdAt';
        vm.resourceCache = ResourceCacheService;

        Restangular.all('suppliers').getList().then(function (suppliers) {
            ResourceCacheService.setResources('suppliers', suppliers);
        });

        $scope.$on('supplier.new', function () {
            vm.showDialog('add');
        });

        vm.onRecordClick = function ($event, supplier) {
            vm.showDialog('update', $event, supplier);
        }

        vm.showDialog = function (mode, $event, supplier) {

            var relationships = {
                category: {
                    type: 'category',
                    values: CategoriesService.get()
                }
            };

            ObjectDialogService.show($event,
                'supplier',
                mode,
                supplier,
                ResourceCacheService.getResources('suppliers'),
                relationships);
        }
    }
})();
