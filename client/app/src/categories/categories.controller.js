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
            vm.resourceCache.loadResources('categories');
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
