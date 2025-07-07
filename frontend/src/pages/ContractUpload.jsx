/**
 * Contract Upload page - Flow 3
 * Upload contract PDF with file validation
 */

import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  FileText,
  Upload,
  CheckCircle,
  AlertTriangle,
  ArrowLeftIcon
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { Tooltip } from 'react-tooltip';

const N8N_CONTRACT_UPLOAD_WEBHOOK='https://primary-production-b52e.up.railway.app/webhook-test/contract-upload';

const schema = yup.object().shape({
  contract: yup
    .mixed()
    .required('Please select a PDF file')
    .test('fileType', 'Only PDF files are allowed', (value) => {
      return value && value.type === 'application/pdf';
    })
    .test('fileSize', 'File size must be less than 10MB', (value) => {
      return value && value.size <= 10 * 1024 * 1024;
    }),
});

const ContractUpload = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [uploadedContract, setUploadedContract] = useState(null)
  const [dragActive, setDragActive] = useState(false)

  // Get procurement data from location state or redirect if not found
  const procurement = location.state?.procurement
  const indentNumber = location.state?.indentNumber

  const { register, handleSubmit, setValue, formState: { errors } } = useForm({
    resolver: yupResolver(schema),
  });

  useEffect(() => {
    if (!procurement || !indentNumber) {
      toast.error('Please search for procurement details first')
      navigate('/contract/search')
    }
  }, [procurement, indentNumber, navigate])

  // Handle file selection
  const handleFileSelect = (selectedFile) => {
    // Validate file type
    if (selectedFile.type !== 'application/pdf') {
      toast.error('Please select a PDF file')
      return
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (selectedFile.size > maxSize) {
      toast.error('File size must be less than 10MB')
      return
    }

    setFile(selectedFile)
  }

  // Handle file input change
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setValue('contract', selectedFile);
    handleFileSelect(selectedFile);
  };

  // Handle drag and drop
  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  // Upload contract
  const uploadContract = async (data) => {
    const file = data.contract;
    if (!file) {
      toast.error('Please select a PDF file');
      return;
    }
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('contract', file);
      formData.append('indent_number', indentNumber);
      formData.append('firm_name', procurement.firm_name);
      const response = await fetch(N8N_CONTRACT_UPLOAD_WEBHOOK, {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to upload contract');
      }
      const responseData = await response.json();
      setUploadedContract(responseData.data?.contract || responseData.data);
      setUploaded(true);
      toast.success('Contract uploaded successfully!');
    } catch (error) {
      console.error('Error uploading contract:', error);
      toast.error(error.message || 'Failed to upload contract');
    } finally {
      setUploading(false);
    }
  };

  // Generate suggested filename
  const getSuggestedFilename = () => {
    if (!procurement) return ''
    return `${procurement.firm_name.replace(/[^a-zA-Z0-9]/g, '_')}_${indentNumber}_PurchaseContract.pdf`
  }

  if (!procurement || !indentNumber) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (uploaded) {
    return (
      <div className="space-y-6">
        {/* Success Message */}
        <div className="card p-8 text-center">
          <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Contract Uploaded Successfully!</h1>
          <p className="text-gray-600 mb-6">
            Your contract has been uploaded and is now waiting for admin approval.
          </p>

          {/* Upload Details */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="text-left space-y-2">
              <div className="flex justify-between">
                <span className="font-medium text-green-900">Contract ID:</span>
                <span className="text-green-800">{uploadedContract?.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-green-900">Indent Number:</span>
                <span className="text-green-800">{indentNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-green-900">Firm Name:</span>
                <span className="text-green-800">{procurement.firm_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-green-900">File Name:</span>
                <span className="text-green-800">{uploadedContract?.file_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-green-900">Status:</span>
                <span className="status-badge status-pending">Pending Approval</span>
              </div>
            </div>
          </div>

          {/* Next Steps */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-blue-900 mb-2">What happens next?</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Admin will review your uploaded contract</li>
              <li>• Once approved, the contract will be sent to the relevant branch</li>
              <li>• You will receive a notification about the approval status</li>
              <li>• Check the admin contracts section for status updates</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center space-x-4">
            <button
              onClick={() => navigate('/contract/search')}
              className="btn-secondary"
            >
              Upload Another Contract
            </button>
            <button
              onClick={() => navigate('/admin/contracts')}
              className="btn-primary"
            >
              View Contract Status
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Upload Purchase Contract</h1>
            <p className="mt-1 text-sm text-gray-600">
              Upload PDF contract for indent {indentNumber}
            </p>
          </div>
          <button
            onClick={() => navigate('/contract/search')}
            className="btn-secondary"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Search
          </button>
        </div>
      </div>

      {/* Procurement Summary */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Procurement Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-500">Indent Number:</span>
            <p className="text-gray-900 font-medium">{indentNumber}</p>
          </div>
          <div>
            <span className="font-medium text-gray-500">Firm Name:</span>
            <p className="text-gray-900">{procurement.firm_name}</p>
          </div>
          <div>
            <span className="font-medium text-gray-500">Total Amount:</span>
            <p className="text-gray-900 font-medium">₹{procurement.total_amount?.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* File Upload */}
      <div className="card p-6">
        <div className="flex items-center mb-6">
          <Upload className="h-6 w-6 text-blue-500 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Upload Contract PDF</h2>
        </div>

        {/* Suggested Filename */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            <strong>Suggested filename:</strong> {getSuggestedFilename()}
            <span data-tip data-for="filenameTip" className="ml-1 cursor-pointer text-blue-500">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20"><path d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-8 4a1 1 0 100-2 1 1 0 000 2zm1-7V7a1 1 0 10-2 0v1a1 1 0 00.293.707l1 1A1 1 0 0110 11a1 1 0 01-1-1H8a2 2 0 104 0 2 2 0 01-2 2z" /></svg>
            </span>
            <Tooltip id="filenameTip" place="top" effect="solid">
              Please rename your file to match this format for better organization.<br />
              Format: Firm_Name_Indent_Number_PurchaseContract.pdf
            </Tooltip>
          </p>
          <p className="text-xs text-blue-700 mt-1">
            Please rename your file to match this format for better organization
          </p>
        </div>

        {/* Drop Zone */}
        <form onSubmit={handleSubmit(uploadContract)}>
          <div
            className={`relative border-2 border-dashed rounded-lg p-6 transition-colors ${
              dragActive
                ? 'border-blue-400 bg-blue-50'
                : file
                ? 'border-green-400 bg-green-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="text-center">
              {file ? (
                <div className="space-y-2">
                  <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
                  <div>
                    <p className="text-lg font-medium text-gray-900">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setFile(null); setValue('contract', null); }}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Remove file
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <div>
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer rounded-md font-medium text-blue-600 hover:text-blue-500"
                    >
                      <span>Upload a file</span>
                      <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        className="sr-only"
                        accept=".pdf"
                        onChange={handleFileChange}
                        {...register('contract')}
                      />
                    </label>
                    <span className="text-gray-500"> or drag and drop</span>
                    <span data-tip data-for="fileTip" className="ml-1 cursor-pointer text-blue-500">
                      <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20"><path d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-8 4a1 1 0 100-2 1 1 0 000 2zm1-7V7a1 1 0 10-2 0v1a1 1 0 00.293.707l1 1A1 1 0 0110 11a1 1 0 01-1-1H8a2 2 0 104 0 2 2 0 01-2 2z" /></svg>
                    </span>
                    <Tooltip id="fileTip" place="top" effect="solid">
                      PDF files only, up to 10MB. File must be clear, complete, and properly signed.<br />
                      Only PDF files are accepted.
                    </Tooltip>
                  </div>
                  <p className="text-xs text-gray-500">PDF files only, up to 10MB</p>
                </div>
              )}
            </div>
          </div>
          {errors.contract && (
            <p className="mt-2 text-xs text-red-600 text-center">{errors.contract.message}</p>
          )}
          {/* Upload Button */}
          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={!file || uploading}
              className="btn-primary"
            >
              {uploading ? (
                <>
                  <Skeleton width={24} height={24} circle={true} inline={true} />
                  <span className="ml-2">Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Contract
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Upload Guidelines */}
      <div className="card p-6">
        <div className="flex items-center mb-4">
          <AlertTriangle className="h-6 w-6 text-yellow-500 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Upload Guidelines</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium text-gray-900 mb-2">File Requirements</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• PDF format only</li>
              <li>• Maximum file size: 10MB</li>
              <li>• Clear and readable document</li>
              <li>• Complete contract with all pages</li>
              <li>• Properly signed and dated</li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 mb-2">Naming Convention</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Use suggested filename format</li>
              <li>• Include firm name and indent number</li>
              <li>• Use underscores instead of spaces</li>
              <li>• End with _PurchaseContract.pdf</li>
              <li>• Avoid special characters</li>
            </ul>
          </div>
        </div>

        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>Important:</strong> Once uploaded, the contract will be sent for admin approval. 
            Ensure all details are correct before uploading.
          </p>
        </div>
      </div>
    </div>
  )
}

export default ContractUpload