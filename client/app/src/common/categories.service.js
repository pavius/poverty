(function() {
    'use strict';

    angular
        .module('poverty')
        .service('CategoriesService', ['Restangular', CategoriesService]);

    function CategoriesService(Restangular) {

        // this service should not exist

        var self = this;
        self.categories = [];

        Restangular.all('categories').getList().then(function(categories) {
            self.categories = categories;
        });

        return {
            get: function() {
                return self.categories;
            }
        }
    };
})();
