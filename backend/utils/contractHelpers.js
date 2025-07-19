/**
 * Contract-specific utility functions
 * Extracted from contractRoutes.js to reduce code duplication and improve maintainability
 */

const { supabase } = require('../config/supabase');
const { sendErrorResponse, sendSuccessResponse, handleDatabaseError } = require('./databaseHelpers');

/**
 * Search procurement details by indent number
 * @param {string} indentNumber - Indent number
 * @returns {Object} Procurement details
 */
async function searchProcurementByIndent(indentNumber) {
  const { data: procurement, error } = await supabase
    .from('procurement_dump')
    .select(`
      *,
      allocation:allocation_id (
        *,
        branch_information:branch_id (
          branch_name,
          branch_code,
          zone,
          state,
          branch_email_id
        )
      )
    `)
    .eq('indent_number', indentNumber)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !procurement) {
    return { 
      success: false, 
      error: 'Procurement details not found for the given indent number' 
    };
  }

  return { 
    success: true, 
    data: { procurement } 
  };
}

/**
 * Get all pending contracts for admin approval
 * @returns {Object} Pending contracts
 */
async function getPendingContracts() {
  try {
    const { data: contracts, error } = await supabase
      .from('purchase_contract_table')
      .select(`
        *,
        uploaded_user:uploaded_by (
          first_name,
          last_name,
          email
        )
      `)
      .eq('status', 'pending')
      .order('uploaded_at', { ascending: false });

    if (error) {
      return { 
        success: false, 
        error: `Failed to fetch pending contracts: ${error.message}` 
      };
    }

    return { 
      success: true, 
      data: {
        contracts: contracts || [],
        count: contracts ? contracts.length : 0
      }
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to get pending contracts: ${error.message}` 
    };
  }
}

/**
 * Get all indent numbers with their contract upload status
 * @returns {Object} Indent status data
 */
async function getIndentContractStatus() {
  try {
    // Get all procurement records
    const { data: procurements, error: procurementError } = await supabase
      .from('procurement_dump')
      .select(`
        indent_number,
        firm_name,
        bale_quantity,
        total_amount,
        created_at,
        allocation:allocation_id (
          branch_information:branch_id (
            branch_name,
            branch_code
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (procurementError) {
      return { 
        success: false, 
        error: `Failed to fetch procurement data: ${procurementError.message}` 
      };
    }

    // Get all uploaded contracts
    const { data: contracts, error: contractError } = await supabase
      .from('purchase_contract_table')
      .select('indent_number, status, uploaded_at, file_name')
      .order('uploaded_at', { ascending: false });

    if (contractError) {
      return { 
        success: false, 
        error: `Failed to fetch contract data: ${contractError.message}` 
      };
    }

    // Create a map of contract status by indent number
    const contractStatusMap = {};
    if (contracts) {
      contracts.forEach(contract => {
        contractStatusMap[contract.indent_number] = {
          status: contract.status,
          uploaded_at: contract.uploaded_at,
          file_name: contract.file_name
        };
      });
    }

    // Combine procurement data with contract status
    const indentStatus = procurements.map(procurement => {
      const contractInfo = contractStatusMap[procurement.indent_number];
      return {
        indent_number: procurement.indent_number,
        firm_name: procurement.firm_name,
        bale_quantity: procurement.bale_quantity,
        total_amount: procurement.total_amount,
        created_at: procurement.created_at,
        branch_name: procurement.allocation?.branch_information?.branch_name || 'Unknown',
        branch_code: procurement.allocation?.branch_information?.branch_code || 'Unknown',
        contract_status: contractInfo ? contractInfo.status : 'pending',
        contract_uploaded_at: contractInfo ? contractInfo.uploaded_at : null,
        contract_file_name: contractInfo ? contractInfo.file_name : null
      };
    });

    return { 
      success: true, 
      data: {
        indent_status: indentStatus,
        total_indents: indentStatus.length,
        contracts_uploaded: Object.keys(contractStatusMap).length
      }
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to get indent contract status: ${error.message}` 
    };
  }
}

/**
 * Get contract details by ID
 * @param {string} contractId - Contract ID
 * @returns {Object} Contract details
 */
async function getContractDetails(contractId) {
  try {
    const { data: contract, error } = await supabase
      .from('purchase_contract_table')
      .select(`
        *,
        uploaded_user:uploaded_by (
          first_name,
          last_name,
          email
        ),
        approved_user:approved_by (
          first_name,
          last_name,
          email
        )
      `)
      .eq('id', contractId)
      .single();

    if (error || !contract) {
      return { 
        success: false, 
        error: 'Contract not found' 
      };
    }

    return { 
      success: true, 
      data: { contract } 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to get contract details: ${error.message}` 
    };
  }
}

/**
 * Update contract status
 * @param {string} contractId - Contract ID
 * @param {string} status - New status
 * @param {string} userId - User ID making the change
 * @param {Object} additionalData - Additional data to update
 * @returns {Object} Update result
 */
async function updateContractStatus(contractId, status, userId, additionalData = {}) {
  try {
    const updateData = {
      status,
      updated_at: new Date().toISOString(),
      ...additionalData
    };

    if (status === 'approved') {
      updateData.approved_by = userId;
      updateData.approved_at = new Date().toISOString();
    }

    const { data: updatedContract, error } = await supabase
      .from('purchase_contract_table')
      .update(updateData)
      .eq('id', contractId)
      .select()
      .single();

    if (error) {
      return { 
        success: false, 
        error: `Failed to update contract status: ${error.message}` 
      };
    }

    return { 
      success: true, 
      data: { contract: updatedContract } 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to update contract status: ${error.message}` 
    };
  }
}

/**
 * Log contract action in audit log
 * @param {string} contractId - Contract ID
 * @param {string} action - Action performed
 * @param {string} userId - User ID
 * @param {Object} newValues - New values
 * @param {Object} oldValues - Old values (optional)
 * @returns {Object} Logging result
 */
async function logContractAction(contractId, action, userId, newValues, oldValues = {}) {
  try {
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'purchase_contract_table',
        record_id: contractId,
        action: action,
        user_id: userId,
        old_values: oldValues,
        new_values: newValues
      });

    return { success: true };
  } catch (error) {
    console.error('Failed to log contract action:', error);
    return { 
      success: false, 
      error: `Logging failed: ${error.message}` 
    };
  }
}

/**
 * Approve contract
 * @param {string} contractId - Contract ID
 * @param {string} userId - User ID
 * @param {string} notes - Approval notes (optional)
 * @returns {Object} Approval result
 */
async function approveContract(contractId, userId, notes = '') {
  try {
    // Get current contract details
    const contractResult = await getContractDetails(contractId);
    if (!contractResult.success) {
      return contractResult;
    }

    const oldValues = {
      status: contractResult.data.contract.status,
      approved_by: contractResult.data.contract.approved_by,
      approved_at: contractResult.data.contract.approved_at
    };

    // Update contract status
    const updateResult = await updateContractStatus(
      contractId, 
      'approved', 
      userId, 
      { approval_notes: notes }
    );

    if (!updateResult.success) {
      return updateResult;
    }

    // Log approval action
    await logContractAction(
      contractId,
      'CONTRACT_APPROVED',
      userId,
      {
        status: 'approved',
        approved_by: userId,
        approved_at: new Date().toISOString(),
        approval_notes: notes
      },
      oldValues
    );

    return { 
      success: true, 
      data: {
        contract: updateResult.data.contract,
        message: 'Contract approved successfully'
      }
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to approve contract: ${error.message}` 
    };
  }
}

/**
 * Get contract statistics
 * @returns {Object} Contract statistics
 */
async function getContractStatistics() {
  try {
    const { data: contracts, error } = await supabase
      .from('purchase_contract_table')
      .select('status, uploaded_at');

    if (error) {
      return { 
        success: false, 
        error: `Failed to fetch contract data: ${error.message}` 
      };
    }

    // Calculate statistics
    const stats = contracts.reduce((acc, contract) => {
      const status = contract.status;
      acc[status] = (acc[status] || 0) + 1;
      acc.total += 1;
      return acc;
    }, { total: 0 });

    // Calculate monthly uploads
    const monthlyUploads = {};
    contracts.forEach(contract => {
      const month = contract.uploaded_at.substring(0, 7); // YYYY-MM
      monthlyUploads[month] = (monthlyUploads[month] || 0) + 1;
    });

    return {
      success: true,
      data: {
        statistics: stats,
        monthly_uploads: monthlyUploads,
        total_contracts: stats.total,
        generated_at: new Date().toISOString()
      }
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to get contract statistics: ${error.message}` 
    };
  }
}

/**
 * Validate contract data
 * @param {Object} contractData - Contract data to validate
 * @returns {Object} Validation result
 */
function validateContractData(contractData) {
  const requiredFields = ['indent_number', 'file_name'];
  const missingFields = requiredFields.filter(field => !contractData[field]);

  if (missingFields.length > 0) {
    return {
      success: false,
      error: `Missing required fields: ${missingFields.join(', ')}`
    };
  }

  if (contractData.file_name && !contractData.file_name.toLowerCase().endsWith('.pdf')) {
    return {
      success: false,
      error: 'Contract file must be a PDF'
    };
  }

  return { success: true };
}

module.exports = {
  searchProcurementByIndent,
  getPendingContracts,
  getIndentContractStatus,
  getContractDetails,
  updateContractStatus,
  logContractAction,
  approveContract,
  getContractStatistics,
  validateContractData
}; 