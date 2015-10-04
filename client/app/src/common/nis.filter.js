(function () {
    'use strict';

    angular
        .module('poverty')
        .filter('nis', ['$filter', NisFilter])

    function NisFilter($filter) {
        return function(input) {
            return $filter('currency')(input, '', 0);
        }
    }
})();
