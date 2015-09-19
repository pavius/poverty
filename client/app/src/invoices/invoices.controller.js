(function(){

  angular
       .module('poverty')
       .controller('InvoicesController', [
          '$scope', 'ObjectDialogService', 'Restangular', 'ResourceCacheService', InvoicesController
       ]);

  function InvoicesController($scope, ObjectDialogService, Restangular, ResourceCacheService) {
    var vm = this;
    vm.order = 'attributes.createdAt';
    vm.resourceCache = ResourceCacheService;

    Restangular.all('invoices').getList({include: 'quote'}).then(function(invoices) {
      ResourceCacheService.setResources('invoices', invoices);
    });

    $scope.$on('invoice.new', function() {
        vm.showDialog('add');
    });

    vm.onRecordClick = function($event, invoice) {
      vm.showDialog('update', $event, invoice);
    };

    vm.getInvoiceSupplier = function(invoice) {

      // the supplier could be directly attached to the invoice (if the invoice is issued directly to a supplier)
      // or it could be through the invoice's quote
      supplierId = _.get(invoice, 'relationships.supplier.data.id');

      // if there's a supplier, prefer that
      if (supplierId) {
        return vm.resourceCache.getResourceById('suppliers', supplierId);
      }
      else {

        // get our quote directly and then pull the supplier from that
        quote = vm.getInvoiceQuote(invoice);

        if (quote) {
          return vm.resourceCache.getResourceById('suppliers', quote.relationships.supplier.data.id);
        }
      }
    }

    vm.getInvoiceQuote = function(invoice) {

        quoteId = _.get(invoice, 'relationships.quote.data.id');

        if (quoteId) {
          return vm.resourceCache.getResourceById('quotes', quoteId);
        }
    }

    vm.showDialog = function(mode, $event, invoice) {

      var self = this;
      self.parent = vm;

      // create a modal controller, to be used as an extension
      function CustomController() {

        var vm = this;
        vm.attachmentInProgress = false;

        function getScanName(resource) {

          // name starts with supplier
          var scanName = sprintf('%s::', self.parent.getInvoiceSupplier(resource).attributes.name);

          // if has a quote
          var quote = self.parent.getInvoiceQuote(resource);
          if (quote)
            scanName += sprintf('%s::', quote.attributes.delivery);

          // add date, amount, extension
          scanName += sprintf('%d::', resource.attributes.amount);
          scanName += Date.now();
          scanName += '.pdf';

          // replace spaces with underscores
          scanName = scanName.replace(/ /g , '_');

          return scanName;
        }

        vm.scan = function(resource) {

          vm.attachmentInProgress = true;

          // create a scan attachment. when we get its ID, store it
          Restangular.all('attachments').post({
            data: {
              attributes: {
                title: getScanName(resource),
                type: "scan"
              }
            }
          }).then(function(attachment) {

            // save the attachment as an attribute in the resource
            resource.relationships.attachment = {data: {type: 'attachment', id: attachment.attributes.id}}

          }).finally(function() {

            vm.attachmentInProgress = false;
          });
        }

        vm.cleanupResource = function(resource) {

          // if quote is set, supplier must not be set. the supplier must be taken from
          // the quote relationship
          if (_.get(resource, 'relationships.quote.data.id') &&
              resource.relationships.supplier) {
            delete resource.relationships.supplier;
          }
        }

        vm.allowModifyAttachment = function(resource) {
          return resource.relationships.supplier.data.id && resource.attributes.amount;
        }
      }

      var relationships = {
        supplier: {
          type: 'supplier',
          values: ResourceCacheService.getResources('suppliers')

        },
        quote: {
          type: 'quote',
          values: ResourceCacheService.getResources('quotes')
        }
      };

      // if the invoice has a quote, we need to load the supplier id so that it will be displayed
      // properly. this is because if a quote is selected, the resource does not contain the supllier
      // id (which is taken from the quote)
      if (invoice && _.get(invoice, 'relationships.quote.data.id')) {
        invoice.relationships.supplier = {
          data: {
            id: vm.parent.getInvoiceSupplier(invoice).data.id,
            type: 'supplier'
          }
        };
      }

      ObjectDialogService.show($event,
        'invoice',
        mode,
        invoice,
        ResourceCacheService.getResources('invoices'),
        relationships,
        CustomController);
    };
  }
})();
