/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Library: QRTraceabilityLib.js
 * Description: Shared utility functions for QR Traceability system
 *
 * Usage: Include in other scripts using define dependency
 */

define(['N/search', 'N/log'],
    function (search, log) {

        /**
         * Parse and validate QR code data
         *
         * @param {string} qrString - Raw QR scan data
         * @returns {Object} { success: boolean, data: object, error: string }
         */
        function parseQRData(qrString) {
            var result = {
                success: false,
                data: null,
                error: ''
            };

            try {
                // Trim whitespace
                qrString = qrString.trim();

                if (!qrString) {
                    result.error = 'QR scan data is empty';
                    return result;
                }

                // Parse JSON
                var qrData = JSON.parse(qrString);

                // Validate structure
                var validation = validateQRStructure(qrData);
                if (!validation.success) {
                    result.error = validation.error;
                    return result;
                }

                result.success = true;
                result.data = qrData;

            } catch (e) {
                result.error = 'Invalid QR code format: ' + e.message;
                log.error('QR Parse Error', e.message);
            }

            return result;
        }

        /**
         * Validate QR data structure
         *
         * @param {Object} qrData - Parsed QR data
         * @returns {Object} { success: boolean, error: string }
         */
        function validateQRStructure(qrData) {
            var result = {
                success: false,
                error: ''
            };

            // Check required fields
            if (!qrData.type || qrData.type !== 'WO_COMPLETION') {
                result.error = 'Invalid QR code type';
                return result;
            }

            if (!qrData.id) {
                result.error = 'Missing completion ID in QR code';
                return result;
            }

            if (!qrData.item) {
                result.error = 'Missing item in QR code';
                return result;
            }

            if (!qrData.qty || qrData.qty <= 0) {
                result.error = 'Invalid quantity in QR code';
                return result;
            }

            result.success = true;
            return result;
        }

        /**
         * Check if completion has already been scanned/fulfilled
         *
         * @param {string} completionId - Work Order Completion internal ID
         * @returns {Object} { isScanned: boolean, fulfillmentId: string }
         */
        function checkCompletionStatus(completionId) {
            try {
                var completionSearch = search.create({
                    type: 'workordercompletion',
                    filters: [
                        ['internalid', 'is', completionId],
                        'AND',
                        ['mainline', 'is', 'T']
                    ],
                    columns: [
                        'custbody_qr_scanned',
                        'custbody_qr_linked_fulfillment'
                    ]
                });

                var isScanned = false;
                var fulfillmentId = '';

                completionSearch.run().each(function (result) {
                    isScanned = result.getValue({ name: 'custbody_qr_scanned' }) === 'T';
                    fulfillmentId = result.getValue({ name: 'custbody_qr_linked_fulfillment' }) || '';
                    return false; // Only need first result
                });

                return {
                    isScanned: isScanned,
                    fulfillmentId: fulfillmentId
                };

            } catch (e) {
                log.error('Error Checking Completion Status', e.message);
                return {
                    isScanned: false,
                    fulfillmentId: ''
                };
            }
        }

        /**
         * Find matching item line on fulfillment
         *
         * @param {Object} fulfillmentRecord - Current fulfillment record
         * @param {string} itemId - Item internal ID from QR
         * @param {string} locationId - Location internal ID from QR (optional)
         * @returns {Object} { found: boolean, lineNumber: number, error: string }
         */
        function findMatchingLine(fulfillmentRecord, itemId, locationId) {
            var result = {
                found: false,
                lineNumber: -1,
                error: ''
            };

            try {
                var lineCount = fulfillmentRecord.getLineCount({
                    sublistId: 'item'
                });

                for (var i = 0; i < lineCount; i++) {
                    var lineItem = fulfillmentRecord.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'item',
                        line: i
                    });

                    var lineLocation = fulfillmentRecord.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'location',
                        line: i
                    });

                    // Match item
                    if (lineItem == itemId) {
                        // If location is specified in QR, match it too
                        if (locationId && lineLocation && lineLocation != locationId) {
                            continue; // Location mismatch, keep looking
                        }

                        result.found = true;
                        result.lineNumber = i;
                        return result;
                    }
                }

                // No match found
                result.error = 'Item not found on this fulfillment';

            } catch (e) {
                result.error = 'Error finding item line: ' + e.message;
                log.error('Error in findMatchingLine', e.message);
            }

            return result;
        }

        /**
         * Lookup inventory number internal ID by lot/serial number
         *
         * @param {string} inventoryNumber - Lot or serial number (text)
         * @param {string} itemId - Item internal ID
         * @returns {Object} { found: boolean, internalId: string, error: string }
         */
        function lookupInventoryNumber(inventoryNumber, itemId) {
            var result = {
                found: false,
                internalId: '',
                error: ''
            };

            try {
                if (!inventoryNumber || !itemId) {
                    result.error = 'Missing required parameters for lookup';
                    return result;
                }

                var invNumSearch = search.create({
                    type: 'inventorynumber',
                    filters: [
                        ['inventorynumber', 'is', inventoryNumber],
                        'AND',
                        ['item', 'is', itemId]
                    ],
                    columns: ['internalid']
                });

                invNumSearch.run().each(function (result_item) {
                    result.found = true;
                    result.internalId = result_item.id;
                    return false; // Only need first result
                });

                if (!result.found) {
                    result.error = 'Inventory number "' + inventoryNumber + '" not found for item ID: ' + itemId;
                }

            } catch (e) {
                result.error = 'Error looking up inventory number: ' + e.message;
                log.error('Error in lookupInventoryNumber', e.message);
            }

            return result;
        }

        /**
         * Format user-friendly error message
         *
         * @param {string} errorType - Type of error
         * @param {Object} details - Error details
         * @returns {string} Formatted error message
         */
        function formatErrorMessage(errorType, details) {
            var messages = {
                'PARSE_ERROR': 'Invalid QR code format. Please scan again.',
                'ALREADY_SCANNED': 'This completion has already been fulfilled (Fulfillment #' + (details.fulfillmentId || '') + ')',
                'ITEM_NOT_FOUND': 'Item "' + (details.itemName || '') + '" is not on this fulfillment',
                'LOCATION_MISMATCH': 'Location mismatch - QR: ' + (details.qrLocation || '') + ', Line: ' + (details.lineLocation || ''),
                'LOT_NOT_FOUND': 'Lot number "' + (details.lotNumber || '') + '" not found in inventory',
                'SERIAL_NOT_FOUND': 'Serial number "' + (details.serialNumber || '') + '" not found in inventory',
                'INSUFFICIENT_QTY': 'Insufficient quantity available',
                'GENERAL_ERROR': 'Error processing QR code: ' + (details.message || 'Unknown error')
            };

            return messages[errorType] || messages['GENERAL_ERROR'];
        }

        /**
         * Build inventory assignment data from QR payload
         *
         * @param {Object} qrData - Parsed QR data
         * @param {string} itemId - Item internal ID
         * @returns {Object} { success: boolean, assignments: array, error: string }
         */
        function buildInventoryAssignments(qrData, itemId) {
            var result = {
                success: false,
                assignments: [],
                error: ''
            };

            try {
                // Process lots
                if (qrData.lots && qrData.lots.length > 0) {
                    for (var i = 0; i < qrData.lots.length; i++) {
                        var lot = qrData.lots[i];

                        // Look up lot internal ID if only number is provided
                        var lotId = lot.numId;
                        if (!lotId && lot.num) {
                            var lotLookup = lookupInventoryNumber(lot.num, itemId);
                            if (!lotLookup.found) {
                                result.error = lotLookup.error;
                                return result;
                            }
                            lotId = lotLookup.internalId;
                        }

                        result.assignments.push({
                            type: 'lot',
                            inventoryNumberId: lotId,
                            inventoryNumber: lot.num,
                            quantity: lot.qty,
                            binId: lot.binId || '',
                            bin: lot.bin || ''
                        });
                    }
                }

                // Process serials
                if (qrData.serials && qrData.serials.length > 0) {
                    for (var j = 0; j < qrData.serials.length; j++) {
                        var serial = qrData.serials[j];

                        // Look up serial internal ID if only number is provided OR if ID is not numeric
                        var serialId = serial.numId;
                        if (!serialId || isNaN(serialId) || serialId === serial.num) {
                            log.debug('ID Lookup Needed', 'Serial: ' + serial.num + ' | Current ID: ' + serialId);
                            var serialLookup = lookupInventoryNumber(serial.num, itemId);
                            if (!serialLookup.found) {
                                result.error = serialLookup.error;
                                return result;
                            }
                            serialId = serialLookup.internalId;
                        }

                        result.assignments.push({
                            type: 'serial',
                            inventoryNumberId: serialId,
                            inventoryNumber: serial.num,
                            quantity: 1, // Serials always qty 1
                            binId: serial.binId || '',
                            bin: serial.bin || ''
                        });
                    }
                }

                result.success = true;

            } catch (e) {
                result.error = 'Error building inventory assignments: ' + e.message;
                log.error('Error in buildInventoryAssignments', e.message);
            }

            return result;
        }

        /**
         * Validate that scanned quantity doesn't exceed line quantity
         *
         * @param {number} scannedQty - Quantity from QR
         * @param {number} lineQty - Quantity on fulfillment line
         * @returns {Object} { valid: boolean, error: string }
         */
        function validateQuantity(scannedQty, lineQty) {
            if (scannedQty > lineQty) {
                return {
                    valid: false,
                    error: 'Scanned quantity (' + scannedQty + ') exceeds line quantity (' + lineQty + ')'
                };
            }

            return {
                valid: true,
                error: ''
            };
        }

        // Return public functions
        return {
            parseQRData: parseQRData,
            validateQRStructure: validateQRStructure,
            checkCompletionStatus: checkCompletionStatus,
            findMatchingLine: findMatchingLine,
            lookupInventoryNumber: lookupInventoryNumber,
            formatErrorMessage: formatErrorMessage,
            buildInventoryAssignments: buildInventoryAssignments,
            validateQuantity: validateQuantity
        };
    });
