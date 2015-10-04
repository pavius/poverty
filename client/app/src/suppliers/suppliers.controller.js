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

        function loadResources() {
            vm.resourceCache.loadResources('suppliers');
        }

        $scope.$on('supplier.new', function () {
            vm.showDialog('add');
        });

        $scope.$on('supplier.show', function() {
            loadResources();
        });

        vm.onRecordClick = function ($event, supplier) {
            vm.showDialog('update', $event, supplier);
        };

        vm.showDialog = function (mode, $event, supplier) {

            var relationships = {
                category: {
                    type: 'category',
                    values: CategoriesService.get()
                }
            };

            ObjectDialogService.show($event,
                'suppliers',
                './src/suppliers/suppliers.modal.tmpl.html',
                mode,
                supplier,
                ResourceCacheService,
                relationships).then(loadResources)
        };
    }
})();
