/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * Script: UE_WorkOrderCompletion_QRGeneration.js
 * Description: Generates QR code payload when Work Order Completion is created or edited
 *
 * Deployment:
 *   - Record Type: Work Order Completion
 *   - Event: After Submit
 *   - Execution Context: CREATE, EDIT
 *
 * Custom Fields Required:
 *   - custbody_qr_payload (Long Text) - Stores JSON payload
 *   - custbody_qr_image (URL) - Link to QR code renderer
 *   - custbody_qr_scanned (Checkbox) - Fulfillment status
 */

define(['N/record', 'N/search', 'N/log', 'N/runtime', 'N/url'],
    function (record, search, log, runtime, url) {

        /**
         * After Submit event handler
         * Generates QR payload and stores it in the completion record
         *
         * @param {Object} context
         * @param {record.Record} context.newRecord - New record object
         * @param {string} context.type - Trigger type (create, edit, delete)
         */
        function afterSubmit(context) {
            try {
                // Only process on CREATE and EDIT
                if (context.type !== context.UserEventType.CREATE &&
                    context.type !== context.UserEventType.EDIT) {
                    log.debug({
                        title: 'QR Generation Skipped',
                        details: 'Event type: ' + context.type + ' (not CREATE or EDIT)'
                    });
                    return;
                }

                var completionRecord = context.newRecord;
                var completionId = completionRecord.id;

                log.audit({
                    title: 'QR Generation Started',
                    details: 'Processing completion ID: ' + completionId + ' | Event: ' + context.type
                });

                // Extract completion data
                var completionData = extractCompletionData(completionRecord);

                // Extract inventory detail (lots/serials)
                var inventoryDetail = extractInventoryDetail(completionRecord);

                // Build QR payload
                var qrPayload = buildQRPayload(completionData, inventoryDetail);

                // Save payload to record
                savePayloadToRecord(completionId, qrPayload);

                log.audit({
                    title: 'QR Generation Complete',
                    details: 'Completion ID: ' + completionId + ' | Payload: ' + JSON.stringify(qrPayload)
                });

            } catch (e) {
                log.error({
                    title: 'Error in QR Generation',
                    details: 'Error: ' + e.message + ' | Stack: ' + e.stack
                });
            }
        }

        /**
         * Extract basic completion data from record
         *
         * @param {record.Record} completionRecord
         * @returns {Object} Completion data object
         */
        function extractCompletionData(completionRecord) {
            return {
                completionId: completionRecord.id,
                workOrderId: completionRecord.getValue({ fieldId: 'createdfrom' }) || '',
                itemId: completionRecord.getValue({ fieldId: 'item' }) || '',
                itemName: completionRecord.getText({ fieldId: 'item' }) || '',
                quantity: parseFloat(completionRecord.getValue({ fieldId: 'quantity' }) || 0),
                locationId: completionRecord.getValue({ fieldId: 'location' }) || '',
                locationName: completionRecord.getText({ fieldId: 'location' }) || '',
                tranDate: completionRecord.getValue({ fieldId: 'trandate' }) || '',
                tranNumber: completionRecord.getValue({ fieldId: 'tranid' }) || ''
            };
        }

        /**
         * Extract inventory detail (lots, serials, bins) from completion record
         *
         * @param {record.Record} completionRecord
         * @returns {Object} Inventory detail object
         */
        function extractInventoryDetail(completionRecord) {
            var inventoryDetail = {
                hasInventoryDetail: false,
                lots: [],
                serials: [],
                bins: []
            };

            try {
                // Get inventory detail subrecord
                var inventorySubrecord = completionRecord.getSubrecord({
                    fieldId: 'inventorydetail'
                });

                if (!inventorySubrecord) {
                    log.debug('Inventory Detail', 'No inventory detail subrecord found');
                    return inventoryDetail;
                }

                inventoryDetail.hasInventoryDetail = true;

                // Get number of inventory assignment lines
                var lineCount = inventorySubrecord.getLineCount({
                    sublistId: 'inventoryassignment'
                });

                log.debug('Inventory Lines', 'Found ' + lineCount + ' inventory assignment lines');

                // Loop through inventory assignment lines
                for (var i = 0; i < lineCount; i++) {
                    var inventoryNumber = inventorySubrecord.getSublistText({
                        sublistId: 'inventoryassignment',
                        fieldId: 'receiptinventorynumber',
                        line: i
                    }) || '';

                    var inventoryNumberId = inventorySubrecord.getSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'receiptinventorynumber',
                        line: i
                    }) || '';

                    // Diagnostic logging
                    log.debug('Inv Detail Line ' + i, 'Number: ' + inventoryNumber + ' | ID: ' + inventoryNumberId + ' | Type: ' + typeof inventoryNumberId);

                    var qty = parseFloat(inventorySubrecord.getSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'quantity',
                        line: i
                    }) || 0);

                    var binNumber = inventorySubrecord.getSublistText({
                        sublistId: 'inventoryassignment',
                        fieldId: 'binnumber',
                        line: i
                    }) || '';

                    var binNumberId = inventorySubrecord.getSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'binnumber',
                        line: i
                    }) || '';

                    // Determine if this is a lot or serial
                    // Serial items typically have qty = 1
                    var isSerial = (qty === 1);

                    var invDetail = {
                        number: inventoryNumber,
                        numberId: inventoryNumberId,
                        qty: qty,
                        bin: binNumber,
                        binId: binNumberId
                    };

                    if (isSerial) {
                        inventoryDetail.serials.push(invDetail);
                    } else {
                        inventoryDetail.lots.push(invDetail);
                    }

                    // Track unique bins
                    if (binNumber && inventoryDetail.bins.indexOf(binNumber) === -1) {
                        inventoryDetail.bins.push(binNumber);
                    }
                }

            } catch (e) {
                log.error({
                    title: 'Error Extracting Inventory Detail',
                    details: 'Error: ' + e.message
                });
            }

            return inventoryDetail;
        }

        /**
         * Build compact QR payload JSON
         *
         * @param {Object} completionData
         * @param {Object} inventoryDetail
         * @returns {Object} QR payload object
         */
        function buildQRPayload(completionData, inventoryDetail) {
            var payload = {
                type: 'WO_COMPLETION',
                id: completionData.completionId,
                wo: completionData.workOrderId,
                item: completionData.itemId,
                itemName: completionData.itemName,
                qty: completionData.quantity,
                loc: completionData.locationId,
                locName: completionData.locationName,
                date: completionData.tranDate,
                tranNum: completionData.tranNumber
            };

            // Add inventory detail if present
            if (inventoryDetail.hasInventoryDetail) {
                // Add lots
                if (inventoryDetail.lots.length > 0) {
                    payload.lots = inventoryDetail.lots.map(function (lot) {
                        return {
                            num: lot.number,
                            numId: lot.numberId,
                            qty: lot.qty,
                            bin: lot.bin,
                            binId: lot.binId
                        };
                    });
                }

                // Add serials
                if (inventoryDetail.serials.length > 0) {
                    payload.serials = inventoryDetail.serials.map(function (serial) {
                        return {
                            num: serial.number,
                            numId: serial.numberId,
                            bin: serial.bin,
                            binId: serial.binId
                        };
                    });
                }

                // Add bins as array for quick reference
                if (inventoryDetail.bins.length > 0) {
                    payload.bins = inventoryDetail.bins;
                }
            }

            return payload;
        }

        /**
         * Save QR payload and image URL to completion record
         *
         * @param {string} completionId
         * @param {Object} qrPayload
         */
        function savePayloadToRecord(completionId, qrPayload) {
            try {
                // Convert payload to JSON string
                var payloadString = JSON.stringify(qrPayload);

                // Get Suitelet URL for QR code rendering
                var qrImageUrl = getQRImageUrl(completionId);

                // Update the record
                record.submitFields({
                    type: 'workordercompletion',
                    id: completionId,
                    values: {
                        custbody_qr_payload: payloadString,
                        custbody_qr_image: qrImageUrl,
                        custbody_qr_scanned: false
                    },
                    options: {
                        enableSourcing: false,
                        ignoreMandatoryFields: true
                    }
                });

                log.debug({
                    title: 'Payload Saved',
                    details: 'Completion ID: ' + completionId + ' | Payload length: ' + payloadString.length + ' chars'
                });

            } catch (e) {
                log.error({
                    title: 'Error Saving Payload',
                    details: 'Completion ID: ' + completionId + ' | Error: ' + e.message
                });
                throw e;
            }
        }

        /**
         * Generate URL for QR code rendering Suitelet
         *
         * @param {string} completionId
         * @returns {string} Suitelet URL
         */
        function getQRImageUrl(completionId) {
            try {
                // Resolve Suitelet URL
                // Note: Update scriptId and deploymentId to match your deployment
                var suiteletUrl = url.resolveScript({
                    scriptId: 'customscript_sl_qr_renderer',
                    deploymentId: 'customdeploy_sl_qr_renderer',
                    params: {
                        id: completionId
                    }
                });

                return suiteletUrl;

            } catch (e) {
                log.error({
                    title: 'Error Generating QR URL',
                    details: 'Error: ' + e.message
                });
                return '';
            }
        }

        return {
            afterSubmit: afterSubmit
        };
    });
