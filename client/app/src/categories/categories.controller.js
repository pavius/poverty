(function () {

    angular
        .module('poverty')
        .controller('CategoriesController', [
            '$rootScope', '$scope', 'ObjectDialogService',
            'ResourceCacheService', CategoriesController
        ]);

    function CategoriesController($rootScope, $scope, ObjectDialogService, ResourceCacheService) {

        var vm = this;
        vm.order = 'attributes.name';
        vm.resourceCache = ResourceCacheService;

        function loadResources() {

            vm.resourceCache.loadResources('categories').then(function(categories) {

                vm.sum = {
                    budget: 0,
                    paid: 0,
                    committed: 0,
                    balance: 0
                };

                _.forEach(categories, function(category) {
                    vm.sum.budget += category.attributes.budget;
                    vm.sum.paid += category.attributes.totalPaid;
                    vm.sum.committed += category.attributes.totalCommitted;
                    vm.sum.balance += category.attributes.balance;
                });
            })
        }

        $scope.$on('category.new', function () {
            vm.showDialog('add');
        });

        $scope.$on('category.show', function() {
            loadResources();
        });

        vm.onRecordClick = function ($event, category) {
            vm.showDialog('update', $event, category);
        };

        vm.showDialog = function (mode, $event, supplier) {

            ObjectDialogService.show($event,
                'categories',
                './src/categories/categories.modal.tmpl.html',
                mode,
                supplier,
                ResourceCacheService).then(loadResources)
        };
    }
})();
