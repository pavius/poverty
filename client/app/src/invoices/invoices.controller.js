(function() {

  angular
       .module('poverty')
       .controller('InvoicesController', [
          '$q', '$scope', 'ObjectDialogService', 'Restangular', 'ResourceCacheService', InvoicesController
       ]);

  function InvoicesController($q, $scope, ObjectDialogService, Restangular, ResourceCacheService) {
    var vm = this;
    vm.order = 'attributes.createdAt';
    vm.resourceCache = ResourceCacheService;

    // get invoices with quotes but don't get attachment
    Restangular.all('invoices').getList({include: 'quote', 'fields[invoice]': '-attachment'}).then(function(invoices) {
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
        vm.attachment = {attributes: _.get(invoice, 'attributes.attachment')};

        function arrayBufferToBase64(buffer) {
          var bytes = new Uint8Array(buffer);
          var binary = '';

          for (var i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }

          return window.btoa(binary);
        }

        function createAttachment(invoiceResource, attachmentResource) {

          // indicate for ui purposes that we've started upload
          vm.attachmentInProgress = true;

          // create a scan attachment. when we get its ID, store it
          Restangular.all('attachments').post(attachmentResource).then(function(attachment) {

            // save the attachment as an attribute in the resource
            invoiceResource.relationships.attachment = {data: {type: attachment.type, id: attachment.id}};

            // save it as part of the controller so it can be displayed
            vm.attachment = attachment;

          }).finally(function() {

            vm.attachmentInProgress = false;
          });
        }

        function getScanName(invoiceResource, extension) {

          // name starts with supplier
          var scanName = sprintf('%s::', self.parent.getInvoiceSupplier(invoiceResource).attributes.name);

          // if has a quote
          var quote = self.parent.getInvoiceQuote(invoiceResource);
          if (quote)
            scanName += sprintf('%s::', quote.attributes.delivery);

          // add date, amount, extension
          scanName += sprintf('%d::', invoiceResource.attributes.amount);
          scanName += Date.now();
          scanName += '.' + extension;

          // replace spaces with underscores
          scanName = scanName.replace(/ /g , '_');

          return scanName;
        }

        vm.uploadAttachment = function(invoiceResource, file) {

          if (!file) return;

          var reader = new FileReader();

          // once we're done loading the file, convert to base64
          reader.onload = function() {

            // get file extension from content type (default to pdf)
            var extension = file.type.split('/')[1] || 'pdf';

            var attachmentResource = {
              data: {
                attributes: {
                  title: getScanName(invoiceResource, extension),
                  type: "media",
                  contentType: file.type,
                  contents: arrayBufferToBase64(reader.result)
                }
              }
            };

            createAttachment(invoiceResource, attachmentResource);
          };

          reader.readAsArrayBuffer(file);
        };

        vm.scan = function(invoiceResource) {

          var attachmentResource = {
            data: {
              attributes: {
                title: getScanName(invoiceResource, 'pdf'),
                type: "scan"
              }
            }
          };

          createAttachment(invoiceResource, attachmentResource);
        };

        vm.cleanupResource = function(resource) {

          // if quote is set, supplier must not be set. the supplier must be taken from
          // the quote relationship
          if (_.get(resource, 'relationships.quote.data.id') &&
              resource.relationships.supplier) {
            delete resource.relationships.supplier;
          }
        };

        vm.allowModifyAttachment = function(resource) {
          return _.get(resource, 'relationships.supplier.data.id') && _.get(resource, 'attributes.amount');
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

      $q(function(resolve, reject) {

        // if invoice is set and there's no attachment, we need to get its attachment, since we didn't get it when we listed it
        if (invoice && !_.get(invoice, 'attributes.attachment')) {

          // get the invoice's attachment
          Restangular.all('invoices').one(invoice.id).get({'fields[invoice]': 'attachment'}).then(function(invoiceWithAttachment) {

            // add attachment to invoice
            invoice.attributes.attachment = invoiceWithAttachment.attributes.attachment;
            console.log(invoice.attributes.attachment.preview.length);

            // we're done
            resolve();
          });

        } else resolve();

      }).finally(function() {

        // if the invoice has a quote, we need to load the supplier id so that it will be displayed
        // properly. this is because if a quote is selected, the resource does not contain the supllier
        // id (which is taken from the quote)
        if (invoice && _.get(invoice, 'relationships.quote.data.id')) {
          invoice.relationships.supplier = {
            data: {
              id: vm.parent.getInvoiceSupplier(invoice).id,
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
      });
    }
  }
})();
