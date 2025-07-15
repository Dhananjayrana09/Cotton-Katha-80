import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const defaultLot = () => ({
  emd_paid_date: '',
  do_payment_dates: [{ date: '', amount: '' }],
  moisture_percentage: '',
  actual_weight: '',
  carrying_days: [0],
  unlifted_lots: [0],
  delivery_dates: [{ date: '', lots: '', additional_carrying_days: 0 }],
});

const ZONES = ['South Zone', 'Other Zone'];

export default function DOSpecifications() {
  const [lots, setLots] = useState([defaultLot()]);
  const [totalLots, setTotalLots] = useState(1);
  const [bidPrice, setBidPrice] = useState(1000);
  const [emdAmount, setEmdAmount] = useState(5000);
  const [cottonValue, setCottonValue] = useState(100);
  const [gstRate, setGstRate] = useState(0.18);
  const [zone, setZone] = useState('South Zone');
  const [customerId, setCustomerId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState('');

  useEffect(() => {
    const fetchCustomers = async () => {
      setCustomersLoading(true);
      setCustomersError('');
      try {
        const res = await api.get('/customer-info');
        setCustomers(res.data.data.customers || []);
      } catch (err) {
        setCustomersError('Failed to load customers');
      } finally {
        setCustomersLoading(false);
      }
    };
    fetchCustomers();
  }, []);

  // Add/remove lot forms
  const handleAddLot = () => {
    setLots([...lots, defaultLot()]);
    setTotalLots(lots.length + 1);
  };
  const handleRemoveLot = () => {
    if (lots.length > 1) {
      setLots(lots.slice(0, -1));
      setTotalLots(lots.length - 1);
    }
  };

  // Handle field changes for lots
  const handleLotChange = (idx, field, value) => {
    const updated = [...lots];
    updated[idx][field] = value;
    setLots(updated);
  };

  // Handle DO payment slots
  const handlePaymentSlotChange = (lotIdx, slotIdx, field, value) => {
    const updated = [...lots];
    updated[lotIdx].do_payment_dates[slotIdx][field] = value;
    setLots(updated);
  };
  const addPaymentSlot = (lotIdx) => {
    const updated = [...lots];
    updated[lotIdx].do_payment_dates.push({ date: '', amount: '' });
    setLots(updated);
  };
  const removePaymentSlot = (lotIdx) => {
    const updated = [...lots];
    if (updated[lotIdx].do_payment_dates.length > 1) {
      updated[lotIdx].do_payment_dates.pop();
      setLots(updated);
    }
  };

  // Handle delivery slots
  const handleDeliverySlotChange = (lotIdx, slotIdx, field, value) => {
    const updated = [...lots];
    updated[lotIdx].delivery_dates[slotIdx][field] = value;
    setLots(updated);
  };
  const addDeliverySlot = (lotIdx) => {
    const updated = [...lots];
    updated[lotIdx].delivery_dates.push({ date: '', lots: '', additional_carrying_days: 0 });
    setLots(updated);
  };
  const removeDeliverySlot = (lotIdx) => {
    const updated = [...lots];
    if (updated[lotIdx].delivery_dates.length > 1) {
      updated[lotIdx].delivery_dates.pop();
      setLots(updated);
    }
  };

  // Paired add/remove for carrying_days and unlifted_lots
  const addCarryingUnlifted = (lotIdx) => {
    const updated = [...lots];
    updated[lotIdx].carrying_days.push(0);
    updated[lotIdx].unlifted_lots.push(0);
    setLots(updated);
  };
  const removeCarryingUnlifted = (lotIdx) => {
    const updated = [...lots];
    if (updated[lotIdx].carrying_days.length > 1) {
      updated[lotIdx].carrying_days.pop();
      updated[lotIdx].unlifted_lots.pop();
      setLots(updated);
    }
  };

  // Form submission
  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      // Validate required fields
      if (!customerId) throw new Error('Customer is required');
      for (let i = 0; i < lots.length; i++) {
        const lot = lots[i];
        if (!lot.emd_paid_date || !lot.moisture_percentage || !lot.actual_weight) {
          throw new Error(`All required fields must be filled for lot ${i + 1}`);
        }
        // Validate delivery_dates
        for (let d = 0; d < lot.delivery_dates.length; d++) {
          const del = lot.delivery_dates[d];
          if (!del.date || !del.lots || Number(del.lots) < 1) {
            throw new Error(`Each delivery entry for lot ${i + 1} must have a valid date and lots >= 1`);
          }
        }
      }
      const payload = {
        customer_id: customerId,
        total_lots: lots.length,
        bid_price: Number(bidPrice),
        emd_amount: Number(emdAmount),
        cotton_value: Number(cottonValue),
        gst_rate: Number(gstRate),
        zone,
        lots: lots.map(lot => ({
          ...lot,
          moisture_percentage: Number(lot.moisture_percentage),
          actual_weight: Number(lot.actual_weight),
          carrying_days: lot.carrying_days.map(Number),
          unlifted_lots: lot.unlifted_lots.map(Number),
          do_payment_dates: lot.do_payment_dates.map(slot => ({ ...slot, amount: Number(slot.amount) })),
          delivery_dates: lot.delivery_dates.filter(
            d => d.date && d.lots && Number(d.lots) >= 1
          ).map(slot => ({ ...slot, lots: Number(slot.lots), additional_carrying_days: Number(slot.additional_carrying_days) }))
        }))
      };
      const res = await api.post('/do-specifications', payload);
      setResult(res.data.data.calculation_results);
    } catch (err) {
      setError(err.message || 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">DO Specifications</h1>
      <div className="mb-4 flex flex-wrap gap-4">
        <div>
          <label className="block font-medium">Customer</label>
          {customersLoading ? (
            <div className="text-gray-500">Loading...</div>
          ) : customersError ? (
            <div className="text-red-500">{customersError}</div>
          ) : (
            <select className="border rounded p-2" value={customerId} onChange={e => setCustomerId(e.target.value)}>
              <option value="">Select Customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.customer_name}</option>)}
            </select>
          )}
        </div>
        <div>
          <label className="block font-medium">Bid Price</label>
          <input type="number" className="border rounded p-2" value={bidPrice} onChange={e => setBidPrice(e.target.value)} />
        </div>
        <div>
          <label className="block font-medium">EMD Amount</label>
          <input type="number" className="border rounded p-2" value={emdAmount} onChange={e => setEmdAmount(e.target.value)} />
        </div>
        <div>
          <label className="block font-medium">Cotton Value</label>
          <input type="number" className="border rounded p-2" value={cottonValue} onChange={e => setCottonValue(e.target.value)} />
        </div>
        <div>
          <label className="block font-medium">GST Rate</label>
          <input type="number" step="0.01" className="border rounded p-2" value={gstRate} onChange={e => setGstRate(e.target.value)} />
        </div>
        <div>
          <label className="block font-medium">Zone</label>
          <select className="border rounded p-2" value={zone} onChange={e => setZone(e.target.value)}>
            {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2 mb-4">
        <button className="bg-blue-500 text-white px-3 py-1 rounded" onClick={handleAddLot}>+ Add Lot</button>
        <button className="bg-red-500 text-white px-3 py-1 rounded" onClick={handleRemoveLot} disabled={lots.length === 1}>- Remove Lot</button>
      </div>
      {lots.map((lot, idx) => (
        <div key={idx} className="border rounded p-4 mb-4 bg-gray-50">
          <h2 className="font-semibold mb-2">Lot {idx + 1}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block">EMD Paid Date *</label>
              <input type="date" className="border rounded p-2 w-full" value={lot.emd_paid_date} onChange={e => handleLotChange(idx, 'emd_paid_date', e.target.value)} />
            </div>
            <div>
              <label className="block">Moisture % *</label>
              <input type="number" className="border rounded p-2 w-full" value={lot.moisture_percentage} onChange={e => handleLotChange(idx, 'moisture_percentage', e.target.value)} />
            </div>
            <div>
              <label className="block">Actual Weight (kg) *</label>
              <input type="number" className="border rounded p-2 w-full" value={lot.actual_weight} onChange={e => handleLotChange(idx, 'actual_weight', e.target.value)} />
            </div>
          </div>
          {/* DO Payment Dates (partial payments) */}
          <div className="mt-4">
            <label className="block font-medium">DO Payment Dates (partial allowed)</label>
            {lot.do_payment_dates.map((slot, slotIdx) => (
              <div key={slotIdx} className="flex gap-2 mb-2">
                <input type="date" className="border rounded p-2" value={slot.date} onChange={e => handlePaymentSlotChange(idx, slotIdx, 'date', e.target.value)} />
                <input type="number" className="border rounded p-2" placeholder="Amount" value={slot.amount} onChange={e => handlePaymentSlotChange(idx, slotIdx, 'amount', e.target.value)} />
                {lot.do_payment_dates.length > 1 && <button className="text-red-500" onClick={() => removePaymentSlot(idx)}>-</button>}
                {slotIdx === lot.do_payment_dates.length - 1 && <button className="text-green-500" onClick={() => addPaymentSlot(idx)}>+</button>}
              </div>
            ))}
          </div>
          {/* Additional Carrying Days & Unlifted Lots (paired) */}
          <div className="mt-4">
            <label className="block font-medium">Additional Carrying Days & Unlifted Lots</label>
            {lot.carrying_days.map((cd, cdIdx) => (
              <div key={cdIdx} className="flex gap-2 mb-2">
                <input type="number" className="border rounded p-2" placeholder="Carrying Days" value={lot.carrying_days[cdIdx]} onChange={e => {
                  const updated = [...lot.carrying_days];
                  updated[cdIdx] = e.target.value;
                  handleLotChange(idx, 'carrying_days', updated);
                }} />
                <input type="number" className="border rounded p-2" placeholder="Unlifted Lots" value={lot.unlifted_lots[cdIdx]} onChange={e => {
                  const updated = [...lot.unlifted_lots];
                  updated[cdIdx] = e.target.value;
                  handleLotChange(idx, 'unlifted_lots', updated);
                }} />
                {lot.carrying_days.length > 1 && <button className="text-red-500" onClick={() => removeCarryingUnlifted(idx)}>-</button>}
                {cdIdx === lot.carrying_days.length - 1 && <button className="text-green-500" onClick={() => addCarryingUnlifted(idx)}>+</button>}
              </div>
            ))}
          </div>
          {/* Delivery Dates (partial deliveries) */}
          <div className="mt-4">
            <label className="block font-medium">Delivery Dates (partial allowed)</label>
            {lot.delivery_dates.map((slot, slotIdx) => (
              <div key={slotIdx} className="flex gap-2 mb-2">
                <input type="date" className="border rounded p-2" value={slot.date} onChange={e => handleDeliverySlotChange(idx, slotIdx, 'date', e.target.value)} />
                <input type="number" className="border rounded p-2" placeholder="Lots" value={slot.lots} onChange={e => handleDeliverySlotChange(idx, slotIdx, 'lots', e.target.value)} />
                <input type="number" className="border rounded p-2" placeholder="Additional Carrying Days" value={slot.additional_carrying_days} onChange={e => handleDeliverySlotChange(idx, slotIdx, 'additional_carrying_days', e.target.value)} />
                {lot.delivery_dates.length > 1 && <button className="text-red-500" onClick={() => removeDeliverySlot(idx)}>-</button>}
                {slotIdx === lot.delivery_dates.length - 1 && <button className="text-green-500" onClick={() => addDeliverySlot(idx)}>+</button>}
              </div>
            ))}
          </div>
        </div>
      ))}
      {error && <div className="text-red-600 mb-2">{error}</div>}
      <button className="bg-green-600 text-white px-6 py-2 rounded" onClick={handleSubmit} disabled={loading}>{loading ? 'Calculating...' : 'Submit & Calculate'}</button>
      {/* Results Section */}
      {result && (
        <div className="mt-8">
          <h2 className="text-xl font-bold mb-2">Results</h2>
          {result.lots.map((lot, idx) => (
            <div key={idx} className="border rounded p-4 mb-4 bg-white">
              <h3 className="font-semibold mb-2">Lot {lot.lot_index}</h3>
              <div>Weight Difference: <span className="font-mono">{lot.weight_difference}</span> ({lot.weight_message})</div>
              <div>Interest Amount: <span className="font-mono">{lot.interest}</span></div>
              <div>Late Lifting Charges: <span className="font-mono">{lot.late_lifting_charges}</span></div>
              {lot.late_lifting_breakdown.length > 0 && (
                <div className="mt-2">
                  <div className="font-medium">Late Lifting Breakdown:</div>
                  <ul className="list-disc ml-6">
                    {lot.late_lifting_breakdown.map((b, bIdx) => (
                      <li key={bIdx}>
                        {b.lots} lots on {b.delivery_date}: {b.rate_label}, Charge: {b.total_charge.toFixed(3)} (GST: {b.gst.toFixed(3)})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
          <div className="border-t pt-4 mt-4">
            <h3 className="font-bold">Summary</h3>
            <div>Total Weight Difference: <span className="font-mono">{result.summary.total_weight_difference}</span></div>
            <div>Total Interest: <span className="font-mono">{result.summary.total_interest}</span></div>
            <div>Total Late Lifting Charges: <span className="font-mono">{result.summary.total_late_lifting_charges}</span></div>
          </div>
        </div>
      )}
    </div>
  );
} 