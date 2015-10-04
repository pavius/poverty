(function () {
    'use strict';

    angular
        .module('poverty')
        .service('ObjectDialogService', ['$mdDialog', '$mdToast', '$log', '$q', 'Restangular', ObjectDialogService])
        .controller('ObjectDialogController', ['$scope', '$mdToast', ObjectDialogController]);

    function ObjectDialogService($mdDialog, $mdToast, $log, $q, Restangular) {

        function buildResourceSkeleton(relationships) {

            // no need to have attributes, etc - that is taken care of by angular as it's referenced
            // in the template
            var resource = {
                relationships: {}
            };

            // convert the variables specified to the modal (which has the following structure):
            //
            //  var relationships = {
            //   mySupplier: {
            //     type: 'supplier',
            //     values: suppliers
            //   }
            // };
            //
            // to something to look like something belonging to a JSON API resource:
            //
            //  {"mySupplier": "data": {"id": undefined, "type": "supplier"}}
            //
            _.forOwn(relationships, function (relationship, relationshipName) {
                resource.relationships[relationshipName] = {data: {id: undefined, type: relationship.type}};
            });

            return resource;
        }

        function reportResult(success, toast, errorDetails) {

            // tell the user something
            $mdToast.show($mdToast.simple().content(toast));

            // if we failed, log an error
            if (!success) {
                $log.error(errorDetails);
            }
        }

        function cleanupResource(controller, resource) {
            if (controller && controller.cleanupResource)
                controller.cleanupResource(resource);
        }

        function addResource(model, newResource, resourceCache, customController) {

            return $q(function(resolve, reject) {

                cleanupResource(customController, newResource);

                Restangular.all(model).post({data: newResource}).then(function (backendResult) {

                    // backend dialogResult *should* be resource with its resource.id populated
                    resourceCache.invalidateCache(model);
                    reportResult(true, sprintf('Successfully created %s', model));
                    resolve();

                }, function (error) {

                    reportResult(false,
                        sprintf('Failed to create %s', model),
                        sprintf('Failed to post resource. resource: %j, error: %j', newResource, error));
                    reject();
                });
            });
        }

        function updateResource(model, originalResource, updatedResource, resourceCache, customController) {

            return $q(function(resolve, reject) {

                cleanupResource(customController, updatedResource);

                // patch on backenbd
                Restangular.all(model).one(updatedResource.id).patch({data: updatedResource}).then(function (backendResult) {

                    resourceCache.invalidateCache(model);
                    reportResult(true, sprintf('Successfully updated %s', model));
                    resolve();

                }, function (error) {

                    reportResult(false,
                        sprintf('Failed to update %s', model),
                        sprintf('Failed to patch resource. resource: %j, error: %j', updatedResource, error));
                    reject();
                });
            });
        }

        function removeResource(model, deletedResource, resourceCache) {

            return $q(function(resolve, reject) {

                Restangular.all(model).one(deletedResource.id).remove().then(function (backendResult) {

                    resourceCache.invalidateCache(model);
                    reportResult(true, sprintf('Successfully deleted %s', model));
                    resolve();

                }, function (error) {

                    reportResult(false,
                        sprintf('Failed to delete %s', model),
                        sprintf('Failed to delete resource. resource: %j, error: %j', deletedResource, error));
                    reject();
                });
            });
        };

        return {
            show: function ($event,
                            model,
                            template,
                            mode,
                            resource,
                            resourceCache,
                            relationships,
                            customController) {

                return $q(function(resolve, reject) {

                    // attach a "get by id" function for the relationships, so controllers can use it
                    _.forOwn(relationships, function(relationship) {

                        relationship.getById = function(requestedId) {
                            for (var valueIdx = 0; valueIdx < this.values.length; ++valueIdx) {
                                if (this.values[valueIdx].id === requestedId)
                                    return this.values[valueIdx];
                            }
                        }
                    });

                    // if the resource does not exist (like when we want to create a resource),
                    // we need to create a skeleton for its relationships and such. angular will populate
                    // fields which have two way bindings but will not decorate the resource with things
                    // like relationship type, etc
                    resource = resource || buildResourceSkeleton(relationships);

                    $mdDialog.show({
                        targetEvent: $event,
                        controller: ObjectDialogController,
                        controllerAs: 'vm',
                        templateUrl: template,
                        locals: {
                            mode: mode,
                            resource: resource,
                            relationships: relationships,
                            customController: customController
                        }
                    })
                        .then(function (dialogResult) {

                            if (dialogResult.action === 'cancel')
                                return reject();

                            if (mode === 'add') {

                                addResource(model,
                                    dialogResult.resource,
                                    resourceCache,
                                    dialogResult.customController,
                                    relationships).then(resolve, reject)

                            } else if (mode === 'update') {

                                // if updated
                                if (dialogResult.action === 'ok') {

                                    updateResource(model,
                                        resource,
                                        dialogResult.resource,
                                        resourceCache,
                                        dialogResult.customController).then(resolve, reject)

                                    // if deleted
                                } else if (dialogResult.action === 'delete') {

                                    removeResource(model,
                                        dialogResult.resource,
                                        resourceCache).then(resolve, reject)
                                }
                            }

                        }, function (error) {
                            reportResult(false,
                                sprintf('Failed to load modal'),
                                sprintf('Failed to load modal. error: %j', error));

                            return reject(error);
                        });
                });
            }
        }
    };

    function ObjectDialogController($scope, $mdDialog, mode, resource, relationships, customController) {
        var vm = this;

        vm.mode = mode;
        vm.resource = angular.copy(resource);
        vm.relationships = relationships;

        // users can pass custom controllers and access them from the template to do
        // custom stuff
        if (customController)
            vm.customController = new customController();

        vm.close = function (action) {
            $mdDialog.hide({
                action: action,
                resource: vm.resource,
                customController: vm.customController
            });
        };
    }
})();
