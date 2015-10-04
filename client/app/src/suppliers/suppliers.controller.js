(function () {

    angular
        .module('poverty')
        .controller('SuppliersController', [
            '$rootScope', '$scope', 'ObjectDialogService',
            'Restangular', 'ResourceCacheService', SuppliersController
        ]);

    function SuppliersController($rootScope, $scope, ObjectDialogService, Restangular, ResourceCacheService) {

        var vm = this;
        vm.order = 'attributes.createdAt';
        vm.resourceCache = ResourceCacheService;

        function loadResources() {
            vm.resourceCache.loadResources('suppliers', {
                'include': 'category',
                'fields[category]': 'name'
            });
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

            // get a list of all suppliers (todo: can be cached somewhere)
            Restangular.all('categories').getList({'fields[category]': 'name'}).then(function(categories) {

                var relationships = {
                    category: {
                        type: 'category',
                        values: categories
                    }
                };

                ObjectDialogService.show($event,
                    'suppliers',
                    './src/suppliers/suppliers.modal.tmpl.html',
                    mode,
                    supplier,
                    ResourceCacheService,
                    relationships).then(loadResources);
            });
        };
    }
})();
