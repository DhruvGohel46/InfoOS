import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { useSettings } from '../../context/SettingsContext';
import { workerAPI } from '../../api/workers';
import { formatCurrency } from '../../utils/api';
import { motion, AnimatePresence } from 'framer-motion';
import PageContainer from '../layout/PageContainer';
import {
  IoArrowBack,
  IoTrash,
  IoCall,
  IoCash,
  IoBriefcase,
  IoCalendar,
  IoCheckmarkCircle,
  IoWarning,
  IoTime,
  IoCreateOutline,
  IoCloseCircleOutline,
  IoTrendingUp,
  IoAdd,
  IoReceiptOutline,
  IoTimeOutline
} from 'react-icons/io5';
import AddWorkerModal from './AddWorkerModal';
import '../../styles/Workers.css';

export default function WorkerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isDark } = useTheme();
  const { showSuccess, showError, showConfirm } = useAlert();
  const { settings } = useSettings();

  const formatDate = (dateInput) => {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const initialTab = searchParams.get('tab') || location.state?.tab || 'attendance';
  const [worker, setWorker] = useState(null);
  const [advances, setAdvances] = useState([]);
  const [salaryHistory, setSalaryHistory] = useState([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [attendance, setAttendance] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [totalPaid, setTotalPaid] = useState(0);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const requestedTab = searchParams.get('tab') || location.state?.tab;
    if (requestedTab && ['attendance', 'advances', 'salary', 'expenses'].includes(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [searchParams, location.state]);

  // Advance Form
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceReason, setAdvanceReason] = useState('');
  const [submittingAdvance, setSubmittingAdvance] = useState(false);

  // Effective salary day
  const effectiveSalaryDay = useMemo(() => {
    const mode = (settings?.salary_date_mode || 'GLOBAL').toUpperCase();
    if (mode === 'WORKER') {
      if (worker?.salary_day && parseInt(worker.salary_day, 10) >= 1 && parseInt(worker.salary_day, 10) <= 31) {
        return parseInt(worker.salary_day, 10);
      }
      const jDate = worker?.join_date || worker?.joinDate;
      if (jDate) {
        const parsedDay = new Date(jDate).getDate();
        if (!isNaN(parsedDay) && parsedDay >= 1 && parsedDay <= 31) {
          return parsedDay;
        }
      }
    }
    const gDay = settings?.global_salary_day || settings?.salary_day;
    return gDay ? parseInt(gDay, 10) || 10 : 10;
  }, [settings?.salary_date_mode, settings?.global_salary_day, settings?.salary_day, worker?.salary_day, worker?.join_date, worker?.joinDate]);

  // Group advances dynamically by payout cycle
  const groupedAdvances = useMemo(() => {
    const groups = {};
    const salaryDay = effectiveSalaryDay;

    advances.forEach((adv) => {
      let advDay, advMonth, advYear;
      if (typeof adv.date === 'string' && adv.date.includes('-')) {
        const parts = adv.date.split('T')[0].split('-');
        advYear = parseInt(parts[0], 10);
        advMonth = parseInt(parts[1], 10);
        advDay = parseInt(parts[2], 10);
      } else {
        const d = new Date(adv.date);
        advDay = d.getDate();
        advMonth = d.getMonth() + 1;
        advYear = d.getFullYear();
      }

      let cycleMonth, cycleYear;
      if (advDay <= salaryDay) {
        cycleMonth = advMonth;
        cycleYear = advYear;
      } else {
        if (advMonth === 12) {
          cycleMonth = 1;
          cycleYear = advYear + 1;
        } else {
          cycleMonth = advMonth + 1;
          cycleYear = advYear;
        }
      }

      const key = `${cycleYear}-${cycleMonth}`;
      if (!groups[key]) {
        const prevM = cycleMonth > 1 ? cycleMonth - 1 : 12;
        const prevY = cycleMonth > 1 ? cycleYear : cycleYear - 1;

        const daysInPrevM = new Date(prevY, prevM, 0).getDate();
        const daysInCycleM = new Date(cycleYear, cycleMonth, 0).getDate();

        const cappedSalaryDay = Math.min(salaryDay, daysInCycleM);
        const cappedPrevSalaryDay = Math.min(salaryDay, daysInPrevM);

        const prevEnd = new Date(prevY, prevM - 1, cappedPrevSalaryDay);
        const start = new Date(prevEnd.getTime() + 24 * 60 * 60 * 1000);
        const end = new Date(cycleYear, cycleMonth - 1, cappedSalaryDay);

        const rangeStr = `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
        const name = new Date(cycleYear, cycleMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' });

        const paidRecord = salaryHistory.find((p) => p.month === cycleMonth && p.year === cycleYear && p.paid);

        groups[key] = {
          key,
          name,
          range: rangeStr,
          year: cycleYear,
          month: cycleMonth,
          isPaid: Boolean(paidRecord),
          items: [],
          total: 0
        };
      }
      groups[key].items.push(adv);
      groups[key].total += adv.amount;
    });

    return Object.values(groups).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  }, [advances, effectiveSalaryDay, salaryHistory]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [w, a, s, att, exp] = await Promise.all([
        workerAPI.getWorker(id),
        workerAPI.getAdvances(id),
        workerAPI.getSalaryHistory(id),
        workerAPI.getWorkerAttendance(id),
        workerAPI.getWorkerExpenses(id)
      ]);
      setWorker(w);
      setAdvances(Array.isArray(a) ? a : (a?.advances || []));
      setSalaryHistory(Array.isArray(s) ? s : (s?.history || []));
      setAttendance(Array.isArray(att) ? att : (att?.attendance || []));
      const expenseList = Array.isArray(exp) ? exp : (exp?.expenses || []);
      setExpenses(expenseList);

      const salaryPaid = (Array.isArray(s) ? s : []).filter((item) => item.paid).reduce((sum, item) => sum + (item.final_salary || 0), 0);
      const directExpensePaid = typeof exp?.total_paid === 'number' ? exp.total_paid : expenseList.reduce((sum, item) => sum + (item.amount || 0), 0);
      setTotalPaid(salaryPaid + directExpensePaid);
    } catch (e) {
      console.error(e);
      showError('Failed to load worker profile data');
    } finally {
      setLoading(false);
    }
  }, [id, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddAdvance = async (e) => {
    e.preventDefault();
    if (!advanceAmount || isNaN(advanceAmount) || parseFloat(advanceAmount) <= 0) {
      showError('Please enter a valid advance amount');
      return;
    }
    setSubmittingAdvance(true);
    try {
      await workerAPI.addAdvance(worker.worker_id, {
        amount: parseFloat(advanceAmount),
        reason: advanceReason.trim()
      });
      showSuccess(`Advance of ₹${advanceAmount} recorded`);
      setAdvanceAmount('');
      setAdvanceReason('');
      loadData();
    } catch (err) {
      showError('Failed to add advance');
    } finally {
      setSubmittingAdvance(false);
    }
  };

  const handleGenerateSpecificSalary = async (month, year) => {
    try {
      if (typeof workerAPI.generateSalary === 'function') {
        await workerAPI.generateSalary(worker.worker_id, month, year);
      } else if (typeof workerAPI.generateSpecificSalary === 'function') {
        await workerAPI.generateSpecificSalary(worker.worker_id, month, year);
      }
      showSuccess('Salary cycle generated');
      loadData();
    } catch (e) {
      showError('Failed to generate salary');
    }
  };

  const handleToggleStatus = async () => {
    if (!worker) return;
    if (worker.status === 'inactive') {
      try {
        await workerAPI.updateWorker(worker.worker_id, { status: 'active' });
        showSuccess(`Worker "${worker.name}" reactivated`);
        loadData();
      } catch (e) {
        showError('Failed to reactivate worker');
      }
    } else {
      const confirmed = await showConfirm({
        title: `Deactivate ${worker.name}?`,
        description: 'This worker will be marked as inactive and will not appear in daily attendance or payroll cycles.',
        confirmLabel: 'Deactivate',
        cancelLabel: 'Cancel',
        variant: 'warning'
      });
      if (confirmed) {
        try {
          await workerAPI.deleteWorker(worker.worker_id, { permanent: false });
          showSuccess(`Worker "${worker.name}" marked as inactive`);
          loadData();
        } catch (e) {
          showError('Failed to deactivate worker');
        }
      }
    }
  };

  const handleDeleteWorker = async () => {
    const confirmed = await showConfirm({
      title: `Permanently Delete ${worker?.name || 'Worker'}?`,
      description: 'Are you sure you want to permanently delete this worker? All associated records will be removed. This action cannot be undone.',
      confirmLabel: 'Delete Permanently',
      cancelLabel: 'Cancel',
      variant: 'danger'
    });
    if (confirmed) {
      try {
        await workerAPI.deleteWorker(worker.worker_id, { permanent: true });
        showSuccess(`Worker "${worker.name}" was permanently removed`);
        navigate('/workers');
      } catch (e) {
        showError('Failed to delete worker');
      }
    }
  };

  const getMissingCycles = () => {
    const missing = [];
    if (!worker || !worker.current_cycle) return missing;

    let currentEndYear, currentEndMonth;
    if (worker.current_cycle.end) {
      const parts = String(worker.current_cycle.end).split('T')[0].split('-');
      currentEndYear = parseInt(parts[0], 10);
      currentEndMonth = parseInt(parts[1], 10);
    } else {
      const now = new Date();
      currentEndYear = now.getFullYear();
      currentEndMonth = now.getMonth() + 1;
    }

    let latestYear = 0;
    let latestMonth = 0;

    if (salaryHistory && salaryHistory.length > 0) {
      latestYear = salaryHistory[0].year;
      latestMonth = salaryHistory[0].month;
    } else {
      const joinDateStr = worker.join_date || worker.joinDate;
      const joinDate = joinDateStr ? new Date(joinDateStr) : new Date();
      latestYear = joinDate.getFullYear();
      latestMonth = joinDate.getMonth();
      if (latestMonth === 0) {
        latestMonth = 12;
        latestYear -= 1;
      }
    }

    let y = latestYear;
    let m = latestMonth + 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }

    const hasSalaryFor = (monthVal, yearVal) => {
      return salaryHistory.some((p) => p.month === monthVal && p.year === yearVal);
    };

    while (y < currentEndYear || (y === currentEndYear && m <= currentEndMonth)) {
      if (!hasSalaryFor(m, y)) {
        missing.push({ month: m, year: y, isCurrent: y === currentEndYear && m === currentEndMonth });
      }
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }

    if (!missing.some((p) => p.month === currentEndMonth && p.year === currentEndYear) && !hasSalaryFor(currentEndMonth, currentEndYear)) {
      missing.push({ month: currentEndMonth, year: currentEndYear, isCurrent: true });
    }

    if (missing.length > 12) {
      missing.splice(0, missing.length - 12);
    }

    return missing.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  };

  if (loading) {
    return (
      <PageContainer>
        <div style={{ padding: '80px 0', textAlign: 'center', color: isDark ? '#94A3B8' : '#64748B' }}>
          <div className="spinner" style={{ marginBottom: '12px' }} />
          <div style={{ fontWeight: 700 }}>Loading worker profile...</div>
        </div>
      </PageContainer>
    );
  }

  if (!worker) {
    return (
      <PageContainer>
        <div style={{ padding: '60px 0', textAlign: 'center', color: isDark ? '#94A3B8' : '#64748B' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>Worker Profile Not Found</div>
          <button
            onClick={() => navigate('/workers')}
            style={{
              marginTop: '16px',
              padding: '10px 20px',
              borderRadius: '12px',
              border: 'none',
              background: '#FF6B1A',
              color: '#FFFFFF',
              fontWeight: 750,
              cursor: 'pointer'
            }}
          >
            ← Back to Staff
          </button>
        </div>
      </PageContainer>
    );
  }

  const presentDays = attendance.filter((a) => a.status === 'Present').length;
  const absentDays = attendance.filter((a) => a.status === 'Absent').length;
  const currentCycleAdvance = worker.current_cycle?.advance || 0;
  const hasAdvance = currentCycleAdvance > 0;

  const tabs = [
    { id: 'attendance', label: 'Attendance Log', count: attendance.length, icon: IoTime },
    { id: 'advances', label: 'Advance History', count: advances.length, icon: IoWarning },
    { id: 'salary', label: 'Salary History', count: salaryHistory.length, icon: IoCash },
    { id: 'expenses', label: 'Linked Expenses', count: expenses.length, icon: IoReceiptOutline }
  ];

  return (
    <PageContainer>
      <div className="workers-page-wrap">
        {/* ─── Top Navigation Header (24px Continuous Curved Glass) ─── */}
        <div
          style={{
            padding: '16px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
            borderRadius: '24px',
            boxShadow: isDark
              ? '0 10px 30px -8px rgba(0, 0, 0, 0.5)'
              : '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
            flexWrap: 'wrap',
            gap: '14px'
          }}
        >
          <button
            type="button"
            onClick={() => navigate('/workers')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              height: '38px',
              padding: '0 16px',
              borderRadius: '12px',
              fontSize: '0.86rem',
              fontWeight: 750,
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
              background: isDark ? '#16171B' : '#FFFFFF',
              color: isDark ? '#FFFFFF' : '#0F172A',
              cursor: 'pointer',
              transition: 'all 0.18s ease'
            }}
          >
            <IoArrowBack size={18} /> Back to Staff
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {worker.status === 'inactive' ? (
              <button
                type="button"
                onClick={handleToggleStatus}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  height: '38px',
                  padding: '0 16px',
                  borderRadius: '12px',
                  fontSize: '0.84rem',
                  fontWeight: 750,
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#10B981',
                  cursor: 'pointer'
                }}
              >
                <IoCheckmarkCircle size={16} /> Reactivate Worker
              </button>
            ) : (
              <button
                type="button"
                onClick={handleToggleStatus}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  height: '38px',
                  padding: '0 16px',
                  borderRadius: '12px',
                  fontSize: '0.84rem',
                  fontWeight: 750,
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: '#F59E0B',
                  cursor: 'pointer'
                }}
              >
                <IoCloseCircleOutline size={16} /> Deactivate Worker
              </button>
            )}

            <button
              type="button"
              onClick={handleDeleteWorker}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                height: '38px',
                padding: '0 16px',
                borderRadius: '12px',
                fontSize: '0.84rem',
                fontWeight: 750,
                border: '1px solid rgba(239, 68, 68, 0.3)',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#EF4444',
                cursor: 'pointer'
              }}
            >
              <IoTrash size={16} /> Delete Permanently
            </button>
          </div>
        </div>

        {/* ─── Hero Profile Card (24px Fluid Curved Geometry) ─── */}
        <div
          style={{
            padding: '24px 28px',
            background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
            borderRadius: '24px',
            boxShadow: isDark
              ? '0 12px 36px -8px rgba(0, 0, 0, 0.6)'
              : '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
            display: 'grid',
            gridTemplateColumns: 'auto 1.3fr 1.3fr 1.8fr',
            gap: '24px',
            alignItems: 'center'
          }}
          className="worker-profile-hero"
        >
          {/* Avatar Frame */}
          <div
            style={{
              width: '96px',
              height: '96px',
              borderRadius: '24px',
              background: 'linear-gradient(135deg, rgba(255,107,26,0.15) 0%, rgba(234,88,12,0.25) 100%)',
              border: '2px solid rgba(255,107,26,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FF6B1A',
              fontSize: '2.4rem',
              fontWeight: 850,
              overflow: 'hidden',
              flexShrink: 0,
              boxShadow: '0 6px 20px rgba(255,107,26,0.2)'
            }}
          >
            {worker.photo ? (
              <img src={worker.photo} alt={worker.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              (worker.name || '?').charAt(0).toUpperCase()
            )}
          </div>

          {/* Name, Role & Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
            <h1
              style={{
                fontSize: '1.65rem',
                fontWeight: 900,
                margin: 0,
                color: isDark ? '#FFFFFF' : '#0F172A',
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {worker.name}
            </h1>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 10px',
                  background: isDark ? '#1C1D22' : '#F1F5F9',
                  border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #CBD5E1',
                  borderRadius: '999px',
                  fontSize: '0.76rem',
                  fontWeight: 750,
                  color: isDark ? '#94A3B8' : '#64748B',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                <IoBriefcase size={12} style={{ color: '#FF6B1A' }} />
                <span>{worker.role}</span>
              </span>

              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 9px',
                  borderRadius: '999px',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  background: worker.status === 'active' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                  color: worker.status === 'active' ? '#10B981' : '#F59E0B',
                  border: worker.status === 'active' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                {worker.status}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowEditModal(true)}
              style={{
                alignSelf: 'flex-start',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 12px',
                borderRadius: '8px',
                fontSize: '0.76rem',
                fontWeight: 750,
                border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #CBD5E1',
                background: isDark ? '#1C1D22' : '#F8FAFC',
                color: isDark ? '#94A3B8' : '#64748B',
                cursor: 'pointer',
                marginTop: '2px'
              }}
            >
              <IoCreateOutline size={14} /> Edit Profile
            </button>
          </div>

          {/* Contact, Base Salary & Join Date */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              borderLeft: isDark ? '1px solid rgba(255,255,255,0.08)' : '1.5px solid #E2E8F0',
              paddingLeft: '24px'
            }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.86rem', color: isDark ? '#94A3B8' : '#64748B', whiteSpace: 'nowrap' }}>
              <IoCall style={{ color: '#FF6B1A' }} size={15} />
              <span style={{ fontWeight: 650, color: isDark ? '#FFFFFF' : '#0F172A' }}>{worker.phone || 'No phone recorded'}</span>
            </div>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.86rem', color: isDark ? '#94A3B8' : '#64748B', whiteSpace: 'nowrap' }}>
              <IoCash style={{ color: '#10B981' }} size={15} />
              <span style={{ fontWeight: 800, color: '#10B981' }}>{formatCurrency(worker.salary)}/mo</span>
            </div>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: isDark ? '#64748B' : '#94A3B8', whiteSpace: 'nowrap' }}>
              <IoCalendar style={{ color: '#3B82F6' }} size={15} />
              <span>Joined {formatDate(worker.join_date || worker.joinDate)}</span>
            </div>
          </div>

          {/* Quick KPI Stats Capsules */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              borderLeft: isDark ? '1px solid rgba(255,255,255,0.08)' : '1.5px solid #E2E8F0',
              paddingLeft: '24px'
            }}
          >
            {[
              { label: 'Attendance', value: `${presentDays} Days`, color: '#3B82F6', icon: <IoTime size={13} /> },
              { label: 'Daily Wage', value: formatCurrency(worker.salary / 30), color: '#10B981', icon: <IoCash size={13} /> },
              { label: 'Advances Due', value: formatCurrency(currentCycleAdvance), color: hasAdvance ? '#EF4444' : '#64748B', icon: <IoWarning size={13} /> },
              { label: 'Lifetime Paid', value: formatCurrency(totalPaid), color: '#FF6B1A', icon: <IoTrendingUp size={13} /> }
            ].map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  padding: '8px 12px',
                  borderRadius: '14px',
                  background: isDark ? '#16171B' : '#F8FAFC',
                  border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #E2E8F0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: kpi.color }}>
                  {kpi.icon}
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: isDark ? '#64748B' : '#94A3B8', whiteSpace: 'nowrap' }}>
                    {kpi.label}
                  </span>
                </div>
                <span style={{ fontSize: '0.90rem', fontWeight: 850, color: isDark ? '#FFFFFF' : '#0F172A', whiteSpace: 'nowrap' }}>
                  {kpi.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Floating Modern Pill Tab Bar (Zero Boxiness) ─── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', margin: '4px 0' }}>
          <div
            style={{
              display: 'inline-flex',
              background: isDark ? '#16171B' : '#F1F5F9',
              borderRadius: '16px',
              padding: '4px',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
              gap: '4px',
              overflowX: 'auto',
              maxWidth: '100%'
            }}
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '8px 20px',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '0.86rem',
                    fontWeight: '750',
                    background: isActive ? 'linear-gradient(135deg, #FF6B1A 0%, #EA580C 100%)' : 'transparent',
                    color: isActive ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                    boxShadow: isActive ? '0 4px 14px rgba(255, 107, 26, 0.35)' : 'none',
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexShrink: 0
                  }}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '1px 6px',
                      borderRadius: '999px',
                      background: isActive ? 'rgba(0, 0, 0, 0.25)' : isDark ? '#1F2026' : '#E2E8F0',
                      color: isActive ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B',
                      fontWeight: 800
                    }}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── Dynamic Tab Content Area (Card-Based & Fluid) ─── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            {/* 1. ATTENDANCE LOG (Card Grid & Timeline) */}
            {activeTab === 'attendance' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Attendance Summary Banner */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '12px'
                  }}
                >
                  <div
                    style={{
                      padding: '16px 20px',
                      background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
                      borderRadius: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px'
                    }}
                  >
                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.12)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <IoCheckmarkCircle size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', color: isDark ? '#64748B' : '#94A3B8' }}>Present Days</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 850, color: '#10B981' }}>{presentDays} Days</div>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '16px 20px',
                      background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
                      borderRadius: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px'
                    }}
                  >
                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <IoCloseCircleOutline size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', color: isDark ? '#64748B' : '#94A3B8' }}>Absent Days</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 850, color: '#EF4444' }}>{absentDays} Days</div>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '16px 20px',
                      background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
                      borderRadius: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px'
                    }}
                  >
                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.12)', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <IoTime size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', color: isDark ? '#64748B' : '#94A3B8' }}>Total Logged</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 850, color: isDark ? '#FFFFFF' : '#0F172A' }}>{attendance.length} Records</div>
                    </div>
                  </div>
                </div>

                {/* Attendance Cards List */}
                {attendance.length === 0 ? (
                  <div
                    style={{
                      padding: '50px 30px',
                      textAlign: 'center',
                      background: isDark ? '#16171B' : '#FFFFFF',
                      border: isDark ? '2px dashed rgba(255, 255, 255, 0.08)' : '2px dashed #CBD5E1',
                      borderRadius: '24px',
                      color: isDark ? '#94A3B8' : '#64748B'
                    }}
                  >
                    No attendance records found for this worker.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                    {attendance.map((a, i) => {
                      const isPresent = a.status === 'Present';
                      return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          style={{
                            padding: '16px 20px',
                            background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
                            borderRadius: '20px',
                            boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.04)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '0.92rem', color: isDark ? '#FFFFFF' : '#0F172A' }}>
                              <IoCalendar size={15} style={{ color: '#FF6B1A' }} />
                              <span>{formatDate(a.date)}</span>
                            </div>
                            <span
                              style={{
                                padding: '3px 10px',
                                borderRadius: '999px',
                                fontSize: '0.76rem',
                                fontWeight: 800,
                                background: isPresent ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                color: isPresent ? '#10B981' : '#EF4444',
                                border: isPresent ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {isPresent ? <IoCheckmarkCircle size={13} /> : <IoCloseCircleOutline size={13} />}
                              {a.status}
                            </span>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '8px 12px',
                              background: isDark ? '#16171B' : '#F8FAFC',
                              borderRadius: '12px',
                              border: isDark ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid #E2E8F0',
                              fontSize: '0.80rem'
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontSize: '0.68rem', fontWeight: 750, color: isDark ? '#64748B' : '#94A3B8', textTransform: 'uppercase' }}>Check In</span>
                              <span style={{ fontWeight: 750, color: isDark ? '#FFFFFF' : '#0F172A' }}>{a.check_in || '—'}</span>
                            </div>
                            <div style={{ width: '1px', height: '24px', background: isDark ? 'rgba(255,255,255,0.08)' : '#CBD5E1' }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'right' }}>
                              <span style={{ fontSize: '0.68rem', fontWeight: 750, color: isDark ? '#64748B' : '#94A3B8', textTransform: 'uppercase' }}>Check Out</span>
                              <span style={{ fontWeight: 750, color: isDark ? '#FFFFFF' : '#0F172A' }}>{a.check_out || '—'}</span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 2. ADVANCE HISTORY (Split View: Cycles & Form) */}
            {activeTab === 'advances' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(300px, 1fr)', gap: '16px', alignItems: 'start' }}>
                {/* Cycles List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {groupedAdvances.length === 0 ? (
                    <div
                      style={{
                        padding: '50px 30px',
                        textAlign: 'center',
                        background: isDark ? '#16171B' : '#FFFFFF',
                        border: isDark ? '2px dashed rgba(255, 255, 255, 0.08)' : '2px dashed #CBD5E1',
                        borderRadius: '24px',
                        color: isDark ? '#94A3B8' : '#64748B'
                      }}
                    >
                      No advance records found for this worker.
                    </div>
                  ) : (
                    groupedAdvances.map((group) => (
                      <div
                        key={group.key}
                        style={{
                          padding: '18px 22px',
                          background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
                          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
                          borderRadius: '22px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1rem', fontWeight: 850, color: isDark ? '#FFFFFF' : '#0F172A' }}>{group.name}</span>
                            <span style={{ fontSize: '0.78rem', color: isDark ? '#64748B' : '#94A3B8', fontWeight: 600 }}>({group.range})</span>
                            {group.isPaid && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800, background: 'rgba(16, 185, 129, 0.12)', color: '#10B981', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                                <IoCheckmarkCircle size={12} /> Settled
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.94rem', fontWeight: 850, color: '#EF4444' }}>
                            Total: {formatCurrency(group.total)}
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {group.items.map((adv, idx) => (
                            <div
                              key={`${group.key}-${idx}`}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '10px 14px',
                                background: isDark ? '#16171B' : '#F8FAFC',
                                borderRadius: '12px',
                                border: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid #E2E8F0'
                              }}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontSize: '0.84rem', fontWeight: 750, color: isDark ? '#FFFFFF' : '#0F172A' }}>
                                  {formatDate(adv.date)}
                                </span>
                                <span style={{ fontSize: '0.76rem', color: isDark ? '#64748B' : '#94A3B8' }}>
                                  {adv.reason || 'No note'}
                                </span>
                              </div>
                              <span style={{ fontSize: '0.88rem', fontWeight: 850, color: '#EF4444' }}>
                                - {formatCurrency(adv.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Quick Advance Form Card */}
                <div
                  style={{
                    padding: '22px 24px',
                    background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
                    borderRadius: '24px',
                    boxShadow: isDark ? '0 10px 30px -8px rgba(0,0,0,0.5)' : '0 4px 20px -2px rgba(15,23,42,0.05)',
                    position: 'sticky',
                    top: '20px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <IoWarning style={{ color: '#EF4444' }} size={18} />
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 850, color: isDark ? '#FFFFFF' : '#0F172A' }}>
                      Record Advance
                    </h3>
                  </div>

                  <form onSubmit={handleAddAdvance} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: isDark ? '#94A3B8' : '#64748B', marginBottom: '6px' }}>
                        Advance Amount (₹) *
                      </label>
                      <input
                        type="number"
                        value={advanceAmount}
                        onChange={(e) => setAdvanceAmount(e.target.value)}
                        required
                        placeholder="e.g. 2000"
                        style={{
                          width: '100%',
                          height: '42px',
                          padding: '0 14px',
                          borderRadius: '12px',
                          background: isDark ? '#16171B' : '#F8FAFC',
                          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
                          color: isDark ? '#FFFFFF' : '#0F172A',
                          fontSize: '0.92rem',
                          fontWeight: 800,
                          outline: 'none'
                        }}
                      />
                    </div>

                    {/* Quick Amount Chips */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {[500, 1000, 2000, 5000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setAdvanceAmount(amt)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '8px',
                            fontSize: '0.76rem',
                            fontWeight: 750,
                            background: isDark ? '#16171B' : '#F1F5F9',
                            border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #CBD5E1',
                            color: isDark ? '#94A3B8' : '#64748B',
                            cursor: 'pointer'
                          }}
                        >
                          +₹{amt}
                        </button>
                      ))}
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: isDark ? '#94A3B8' : '#64748B', marginBottom: '6px' }}>
                        Reason / Note (Optional)
                      </label>
                      <input
                        value={advanceReason}
                        onChange={(e) => setAdvanceReason(e.target.value)}
                        placeholder="e.g. Festival advance, Medical"
                        style={{
                          width: '100%',
                          height: '42px',
                          padding: '0 14px',
                          borderRadius: '12px',
                          background: isDark ? '#16171B' : '#F8FAFC',
                          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
                          color: isDark ? '#FFFFFF' : '#0F172A',
                          fontSize: '0.86rem',
                          outline: 'none'
                        }}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submittingAdvance || !advanceAmount}
                      style={{
                        height: '42px',
                        borderRadius: '12px',
                        border: 'none',
                        background: '#EF4444',
                        color: '#FFFFFF',
                        fontWeight: 800,
                        fontSize: '0.88rem',
                        cursor: submittingAdvance || !advanceAmount ? 'not-allowed' : 'pointer',
                        boxShadow: '0 4px 14px rgba(239, 68, 68, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <IoAdd size={18} />
                      {submittingAdvance ? 'Recording...' : 'Record Advance'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* 3. SALARY HISTORY (Rich Cards) */}
            {activeTab === 'salary' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {getMissingCycles().map((cycle) => {
                  const cycleGroup = groupedAdvances.find(g => g.year === cycle.year && g.month === cycle.month);
                  const cycleAdvance = cycleGroup ? cycleGroup.total : (cycle.isCurrent ? (worker.current_cycle?.advance || 0) : 0);
                  const baseSalary = Number(worker.salary) || 0;
                  const cycleNetPayable = cycle.isCurrent && worker.current_cycle?.net_payable !== undefined
                    ? worker.current_cycle.net_payable
                    : Math.max(0, baseSalary - cycleAdvance);

                  return (
                    <div
                      key={`missing-${cycle.year}-${cycle.month}`}
                      style={{
                        padding: '18px 24px',
                        background: isDark ? 'linear-gradient(165deg, rgba(255,107,26,0.08) 0%, #18191D 100%)' : '#FFF7ED',
                        border: '1.5px solid rgba(255,107,26,0.3)',
                        borderRadius: '22px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '16px'
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '1.1rem', fontWeight: 850, color: isDark ? '#FFFFFF' : '#0F172A' }}>
                            {new Date(cycle.year, cycle.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                          </span>
                          <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800, background: 'rgba(255, 107, 26, 0.2)', color: '#FF6B1A' }}>
                            {cycle.isCurrent ? 'Current Cycle' : 'Pending Cycle'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '0.82rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                          <span>Base: {formatCurrency(worker.salary)}</span>
                          <span>•</span>
                          <span style={{ color: '#EF4444' }}>Advances: -{formatCurrency(cycleAdvance)}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 750, textTransform: 'uppercase', color: isDark ? '#64748B' : '#94A3B8' }}>Estimated Payout</div>
                          <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#10B981' }}>
                            {formatCurrency(cycleNetPayable)}
                          </div>
                        </div>

                        <button
                          onClick={() => handleGenerateSpecificSalary(cycle.month, cycle.year)}
                          style={{
                            padding: '8px 20px',
                            borderRadius: '12px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                            color: '#FFFFFF',
                            fontWeight: 800,
                            fontSize: '0.84rem',
                            cursor: 'pointer',
                            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
                          }}
                        >
                          Generate Slip
                        </button>
                      </div>
                    </div>
                  );
                })}

                {salaryHistory.map((pay, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '18px 24px',
                      background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
                      borderRadius: '22px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 850, color: isDark ? '#FFFFFF' : '#0F172A' }}>
                          {new Date(pay.year, pay.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            background: pay.paid ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                            color: pay.paid ? '#10B981' : '#F59E0B',
                            border: pay.paid ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(245, 158, 11, 0.25)'
                          }}
                        >
                          {pay.paid ? (
                            <>
                              <IoCheckmarkCircle size={12} /> Paid
                            </>
                          ) : (
                            <>
                              <IoTimeOutline size={12} /> Pending Payout
                            </>
                          )}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '0.82rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                        <span>Base: {formatCurrency(pay.base_salary)}</span>
                        <span>•</span>
                        <span style={{ color: '#EF4444' }}>Deductions: -{formatCurrency(pay.advance_deduction)}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 750, textTransform: 'uppercase', color: isDark ? '#64748B' : '#94A3B8' }}>Net Final Pay</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#10B981' }}>{formatCurrency(pay.final_salary)}</div>
                      </div>

                      {!pay.paid && (
                        <button
                          onClick={async () => {
                            try {
                              await workerAPI.markPaid(pay.payment_id);
                              showSuccess('Salary marked as paid');
                              loadData();
                            } catch (e) {
                              showError('Failed to mark paid');
                            }
                          }}
                          style={{
                            padding: '8px 20px',
                            borderRadius: '12px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                            color: '#FFFFFF',
                            fontWeight: 800,
                            fontSize: '0.84rem',
                            cursor: 'pointer',
                            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
                          }}
                        >
                          Mark as Paid
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 4. LINKED EXPENSES (Cards & Overview) */}
            {activeTab === 'expenses' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div
                  style={{
                    padding: '16px 20px',
                    background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
                    borderRadius: '20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: isDark ? '#94A3B8' : '#64748B' }}>
                    Total Lifetime Direct Expenses Paid
                  </span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#FF6B1A' }}>
                    {formatCurrency(totalPaid)}
                  </span>
                </div>

                {expenses.length === 0 ? (
                  <div
                    style={{
                      padding: '50px 30px',
                      textAlign: 'center',
                      background: isDark ? '#16171B' : '#FFFFFF',
                      border: isDark ? '2px dashed rgba(255, 255, 255, 0.08)' : '2px dashed #CBD5E1',
                      borderRadius: '24px',
                      color: isDark ? '#94A3B8' : '#64748B'
                    }}
                  >
                    No direct business expenses recorded for this worker.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                    {expenses.map((exp) => (
                      <div
                        key={exp.id}
                        style={{
                          padding: '16px 20px',
                          background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
                          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
                          borderRadius: '20px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.78rem', color: isDark ? '#64748B' : '#94A3B8', fontWeight: 650 }}>
                            {new Date(exp.date).toLocaleDateString()}
                          </span>
                          <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '0.72rem', background: 'rgba(255, 107, 26, 0.12)', color: '#FF6B1A', fontWeight: 800 }}>
                            {exp.category}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.94rem', fontWeight: 800, color: isDark ? '#FFFFFF' : '#0F172A' }}>
                          {exp.title}
                        </div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: isDark ? '#FFFFFF' : '#0F172A', textAlign: 'right' }}>
                          {formatCurrency(exp.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Edit Modal */}
        <AddWorkerModal
          open={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false);
            loadData();
          }}
          initialData={worker}
        />
      </div>
    </PageContainer>
  );
}
