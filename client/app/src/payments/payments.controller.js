(function () {

    angular
        .module('poverty')
        .controller('PaymentsController', [
            '$q', '$scope', 'ObjectDialogService', 'Restangular', 'ResourceCacheService', PaymentsController
        ]);

    function PaymentsController($q, $scope, ObjectDialogService, Restangular, ResourceCacheService) {
        var vm = this;
        vm.order = 'attributes.createdAt';
        vm.resourceCache = ResourceCacheService;

        function loadResources() {
            vm.resourceCache.loadResources('payments', {
                'include': 'supplier,purchaseOrder.supplier',
                'fields[payment]': '-attachment'
            });
        }

        $scope.$on('payment.new', function () {
            vm.showDialog('add');
        });

        $scope.$on('payment.show', function() {
            loadResources();
        });

        vm.onRecordClick = function ($event, payment) {
            vm.showDialog('update', $event, payment);
        };

        vm.getPaymentSupplier = function (payment) {

            // the supplier could be directly attached to the payment (if the payment is issued directly to a supplier)
            // or it could be through the payment's purchaseOrder
            supplierId = _.get(payment, 'relationships.supplier.data.id');

            // if there's a supplier, prefer that
            if (supplierId) {
                return payment.relationships.supplier.data.getIncluded();
            }

            // get our purchaseOrder directly and then pull the supplier from that
            var purchaseOrder = vm.getPaymentPurchaseOrder(payment);

            if (purchaseOrder) {
                var sup =  purchaseOrder.relationships.supplier.data.getIncluded();
                return sup;
            }
        };

        vm.getPaymentPurchaseOrder = function (payment) {

            purchaseOrderId = _.get(payment, 'relationships.purchaseOrder.data.id');

            if (purchaseOrderId) {
                return payment.relationships.purchaseOrder.data.getIncluded();
            }
        };

        vm.showDialog = function (mode, $event, payment) {

            var self = this;
            self.parent = vm;

            // create a modal controller, to be used as an extension
            function CustomController() {

                var vm = this;
                vm.hasPo = false;
                vm.poSupplierId = null;
                vm.attachmentInProgress = false;
                vm.attachment = {attributes: _.get(payment, 'attributes.attachment')};

                if (payment && _.get(payment, 'relationships.purchaseOrder.data.id')) {
                    vm.hasPo = true;
                    vm.poSupplierId = self.parent.getPaymentSupplier(payment).id;
                }

                function arrayBufferToBase64(buffer) {
                    var bytes = new Uint8Array(buffer);
                    var binary = '';

                    for (var i = 0; i < bytes.byteLength; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }

                    return window.btoa(binary);
                }

                function createAttachment(paymentResource, attachmentResource) {

                    // indicate for ui purposes that we've started upload
                    vm.attachmentInProgress = true;

                    // create a scan attachment. when we get its ID, store it
                    Restangular.all('attachments').post(attachmentResource).then(function (attachment) {

                        // save the attachment as an attribute in the resource
                        paymentResource.relationships.attachment = {data: {type: attachment.type, id: attachment.id}};

                        // save it as part of the controller so it can be displayed
                        vm.attachment = attachment;

                    }).finally(function () {

                        vm.attachmentInProgress = false;
                    });
                }

                function getScanName(paymentResource, relationships, extension) {

                    var scanName;

                    // name starts with supplier. take the proper value according to the current setting of hasPo
                    if (vm.hasPo) {

                        var supplierName = relationships.supplier.getById(vm.poSupplierId).attributes.name;

                        var purchaseOrderId = paymentResource.relationships.purchaseOrder.data.id;
                        purchaseOrderName = relationships.purchaseOrder.getById(purchaseOrderId).attributes.delivery;

                        scanName = sprintf('Supplier(%s)-PO(%s)', supplierName, purchaseOrderName);

                    } else {

                        var supplierName = relationships.supplier.getById(paymentResource.relationships.supplier.data.id).attributes.name;
                        scanName = sprintf('Supplier(%s)', supplierName);
                    }

                    // add date, amount, extension
                    scanName += sprintf('-Amount(%s)', paymentResource.attributes.amount);
                    scanName += sprintf('-At(%s)', Date.now());
                    scanName += '.' + extension;

                    // replace spaces with underscores
                    scanName = scanName.replace(/ /g, '_');

                    return scanName;
                }

                vm.uploadAttachment = function (paymentResource, file, relationships) {

                    if (!file) return;

                    var reader = new FileReader();

                    // once we're done loading the file, convert to base64
                    reader.onload = function () {

                        // get file extension from content type (default to pdf)
                        var extension = file.type.split('/')[1] || 'pdf';

                        var attachmentResource = {
                            data: {
                                attributes: {
                                    title: getScanName(paymentResource, relationships, extension),
                                    type: "media",
                                    contentType: file.type,
                                    contents: arrayBufferToBase64(reader.result)
                                }
                            }
                        };

                        createAttachment(paymentResource, attachmentResource);
                    };

                    reader.readAsArrayBuffer(file);
                };

                vm.scan = function (paymentResource, relationships) {

                    var attachmentResource = {
                        data: {
                            attributes: {
                                title: getScanName(paymentResource, relationships, 'pdf'),
                                type: "scan"
                            }
                        }
                    };

                    createAttachment(paymentResource, attachmentResource);
                };

                /* vm.cleanupResource = function (resource) {

                    // if purchaseOrder is set, supplier must not be set. the supplier must be taken from
                    // the purchaseOrder relationship
                    if (_.get(resource, 'relationships.purchaseOrder.data.id') &&
                        resource.relationships.supplier) {
                        resource.relationships.supplier = null;
                    }
                }; */

                vm.allowModifyAttachment = function (resource) {

                    // if there's an amount and a supplier OR a purchase order
                    return _.get(resource, 'attributes.amount') &&
                        (_.get(resource, 'relationships.supplier.data.id') || _.get(resource, 'relationships.purchaseOrder.data.id'));
                }
            };

            $q(function (resolve, reject) {

                // if payment is set and there's no attachment, we need to get its attachment, since we didn't get it when we listed it
                if (payment && !_.get(payment, 'attributes.attachment')) {

                    // get the payment's attachment
                    Restangular.all('payments').one(payment.id).get({'fields[payment]': 'attachment'}).then(function (paymentWithAttachment) {

                        // add attachment to payment
                        payment.attributes.attachment = paymentWithAttachment.attributes.attachment;

                        // we're done
                        resolve();
                    });

                } else resolve();

            }).finally(function () {

                // get relationships
                $q.all([
                    Restangular.all('suppliers').getList({'fields[supplier]': 'name'}),
                    Restangular.all('purchaseOrders').getList({'fields[purchaseOrder]': 'delivery'})

                ]).then(function(values) {
                    var relationships = {
                        supplier: {
                            type: 'supplier',
                            values: values[0]

                        },
                        purchaseOrder: {
                            type: 'purchaseOrder',
                            values: values[1]
                        }
                    };

                    ObjectDialogService.show($event,
                        'payments',
                        './src/payments/payments.modal.tmpl.html',
                        mode,
                        payment,
                        ResourceCacheService,
                        relationships,
                        CustomController).then(loadResources);
                });
            });
        }
    }
})();
