(function(){
  'use strict';

  angular
    .module('poverty')
    .service('ObjectDialogService', ['$mdDialog', '$mdToast', '$log', 'Restangular', ObjectDialogService])
    .controller('ObjectDialogController', ['$scope', '$mdToast', ObjectDialogController]);

  function ObjectDialogService($mdDialog, $mdToast, $log, Restangular) {

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
      _.forOwn(relationships, function(relationship, relationshipName) {
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

    return {
      show: function($event, model, mode, resource, resources, relationships, customController) {

        var plural_model = pluralize(model);
        var rest = Restangular.all(plural_model);

        // if the resource does not exist (like when we want to create a resource),
        // we need to create a skeleton for its relationships and such. angular will populate
        // fields which have two way bindings but will not decorate the resource with things
        // like relationship type, etc
        resource = resource || buildResourceSkeleton(relationships);

        // calculate template by model
        var template = sprintf('src/%s/%s.modal.tmpl.html', plural_model, plural_model);

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
        .then(function(dialogResult) {

          if (dialogResult.action !== 'cancel') {

            // added?
            if (mode === 'add') {

              rest.post({data: dialogResult.resource}).then(function(backendResult) {

                // backend dialogResult *should* be resource with its resource.id populated
                resources.push(backendResult);
                reportResult(true, sprintf('Successfully created %s', model));

              }, function(error) {

                reportResult(false,
                  sprintf('Failed to create %s', model),
                  sprintf('Failed to post resource. resource: %j, error: %j', dialogResult.resource, error));
              });

            // updated (delete or update)
            } else if (mode === 'update') {

              // if updated
              if (dialogResult.action === 'ok') {

                // patch on backenbd
                rest.one(dialogResult.resource.id).patch({data: dialogResult.resource}).then(function(backendResult) {

                  // copy all updated members to the resource
                  for (var p in dialogResult.resource)
                    resource[p] = dialogResult.resource[p];

                  reportResult(true, sprintf('Successfully updated %s', model));

                }, function(error) {

                  reportResult(false,
                    sprintf('Failed to update %s', model),
                    sprintf('Failed to patch resource. resource: %j, error: %j', dialogResult.resource, error));
              });

              // if deleted
              } else if (dialogResult.action === 'delete') {

                // delete from backend
                rest.one(dialogResult.resource.id).remove().then(function(backendResult) {

                  // remove from instances
                  for (var idx = 0; idx < resources.length; ++idx)
                    if (resources[idx].id == dialogResult.resource.id)
                      resources.splice(idx, 1);

                  reportResult(true, sprintf('Successfully deleted %s', model));

                }, function(error) {

                  reportResult(false,
                    sprintf('Failed to delete %s', model),
                    sprintf('Failed to delete resource. resource: %j, error: %j', dialogResult.resource, error));
                });
              }
            }
          }
        }, function(error) {
          reportResult(false,
            sprintf('Failed to load modal'),
            sprintf('Failed to load modal. error: %j', error));
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

      vm.close = function(action) {
        $mdDialog.hide({
          action: action,
          resource: vm.resource
        });
    };
  }
})();
