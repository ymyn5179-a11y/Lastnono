import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  Layers,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import { AdminCmsPanel } from '../components/AdminCmsPanel';
import { AdminGovernancePanel, AdminOpsPanel } from '../components/AdminGovernanceAndOpsPanel';
import { NonoLandLogo } from '../components/NonoLandLogo';
import { useNonoLand } from '../context/NonoLandContext';
import { t } from '../i18n/translations';
import type {
  AccountStatus,
  Classroom,
  TeacherExam,
  TeacherPermission,
  UserRole,
} from '../types/nonoland';
import { DEFAULT_TEACHER_PERMISSIONS } from '../utils/validation';

interface AdminTeacherRow {
  id: string;
  name: string;
  email: string;
  phone?: string;
  bio?: string;
  status: AccountStatus;
  createdAt?: string;
  updatedAt?: string;
  classesCount: number;
  questionsCount: number;
  examsCount: number;
  assignedClasses?: Array<{ id: string; name: string; subject: string; studentCount: number }>;
  teacherProfile?: {
    subjects: string[];
    permissions: TeacherPermission[];
    approvedBy?: string;
    approvedAt?: string;
    rejectedBy?: string;
    rejectedAt?: string;
    rejectionReason?: string;
    suspendedBy?: string;
    suspendedAt?: string;
    suspensionReason?: string;
  };
}

interface AdminStudentRow {
  id: string;
  displayName: string;
  ageGroup: string;
  parentName: string;
  studentUserEmail: string;
  level: number;
  stars: number;
}

interface AdminParentRow {
  id: string;
  name: string;
  email: string;
  status: AccountStatus;
  emailVerified: boolean;
  familyId: string | null;
  createdAt: string;
  childrenCount: number;
  children: Array<{
    id: string;
    displayName: string;
    ageGroup: string;
    language: string;
    level: number;
    stars: number;
  }>;
}

interface AdminTeamRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  createdAt: string;
}

interface OverviewStats {
  totalParents: number;
  totalFamilies: number;
  totalChildren: number;
  totalTeachers: number;
  pendingTeachers: number;
  activeTeachers: number;
  rejectedTeachers: number;
  suspendedTeachers: number;
  totalClasses: number;
  activeClasses: number;
  auditLogsCount: number;
  adminCount: number;
}

type AdminTab =
  | 'overview'
  | 'requests'
  | 'teachers'
  | 'families'
  | 'classes'
  | 'exams'
  | 'governance'
  | 'ops'
  | 'cms';

const ADMIN_ALLOWED_ROLES = new Set([
  'super_admin',
  'admin',
  'content_admin',
  'curriculum_manager',
  'finance_admin',
  'support_agent',
]);

export const AdminDashboardScreen: React.FC = () => {
  const { authSession, language, navigate, logoutParent } = useNonoLand();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null);
  const [teachers, setTeachers] = useState<AdminTeacherRow[]>([]);
  const [students, setStudents] = useState<AdminStudentRow[]>([]);
  const [parents, setParents] = useState<AdminParentRow[]>([]);
  const [adminTeam, setAdminTeam] = useState<AdminTeamRow[]>([]);
  const [classes, setClasses] = useState<Array<Classroom & { teacherName: string; studentNames: string[] }>>([]);
  const [teacherExams, setTeacherExams] = useState<Array<TeacherExam & { teacherName: string }>>([]);

  // Filters & Modals
  const [teacherSearch, setTeacherSearch] = useState('');
  const [teacherStatusFilter, setTeacherStatusFilter] = useState<'all' | AccountStatus>('all');
  const [familySearch, setFamilySearch] = useState('');
  const [detailTeacher, setDetailTeacher] = useState<AdminTeacherRow | null>(null);
  const [reasonModal, setReasonModal] = useState<{
    action: 'reject' | 'suspend';
    teacher: AdminTeacherRow;
  } | null>(null);
  const [reasonInput, setReasonInput] = useState('');

  const [activityTeacherName, setActivityTeacherName] = useState('');
  const [teacherActivityLogs, setTeacherActivityLogs] = useState<
    Array<{ id: string; summary: string; createdAt: string }>
  >([]);

  // Create Teacher Form
  const [newTName, setNewTName] = useState('');
  const [newTEmail, setNewTEmail] = useState('');
  const [newTPassword, setNewTPassword] = useState('');
  const [newTPhone, setNewTPhone] = useState('');

  // Create Admin Form (Super Admin Only)
  const [newAdmName, setNewAdmName] = useState('');
  const [newAdmEmail, setNewAdmEmail] = useState('');
  const [newAdmPassword, setNewAdmPassword] = useState('');
  const [newAdmRole, setNewAdmRole] = useState<UserRole>('admin');

  // Create Class Form
  const [newClsName, setNewClsName] = useState('');
  const [newClsSubject, setNewClsSubject] = useState('comprehensive');
  const [newClsLevel, setNewClsLevel] = useState<'all' | 1>(1);
  const [newClsTeacherId, setNewClsTeacherId] = useState('');
  const [newClsStudents, setNewClsStudents] = useState<string[]>([]);
  const [addStuMap, setAddStuMap] = useState<Record<string, string>>({});

  const apiFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const headers: Record<string, string> = {
        ...(init.headers as Record<string, string> | undefined),
      };
      if (authSession.csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(init.method || 'GET')) {
        headers['x-csrf-token'] = authSession.csrfToken;
      }
      return fetch(url, { ...init, credentials: 'include', headers });
    },
    [authSession.csrfToken],
  );

  const userRole = authSession.user?.role || '';
  const isRoleAdmin = authSession.authenticated && ADMIN_ALLOWED_ROLES.has(userRole);
  const isSuperAdmin = authSession.authenticated && userRole === 'super_admin';

  const loadAdminData = useCallback(async () => {
    if (!isRoleAdmin) return;
    try {
      const requests: Array<Promise<Response>> = [
        apiFetch('/api/admin/overview-stats'),
        apiFetch('/api/admin/teachers'),
        apiFetch('/api/admin/students'),
        apiFetch('/api/admin/classes'),
        apiFetch('/api/admin/exams'),
        apiFetch('/api/admin/parents'),
      ];
      if (isSuperAdmin) {
        requests.push(apiFetch('/api/admin/admins'));
      }

      const [ovRes, tRes, sRes, cRes, eRes, pRes, admRes] = await Promise.all(requests);
      if (ovRes?.ok) {
        const d = await ovRes.json();
        setOverviewStats(d.stats || null);
      }
      if (tRes?.ok) {
        const d = await tRes.json();
        const rows: AdminTeacherRow[] = d.teachers || [];
        setTeachers(rows);
        const firstActive = rows.find((tRow) => tRow.status === 'active') || rows[0];
        if (firstActive && !newClsTeacherId) setNewClsTeacherId(firstActive.id);
      }
      if (sRes?.ok) setStudents((await sRes.json()).students || []);
      if (cRes?.ok) setClasses((await cRes.json()).classes || []);
      if (eRes?.ok) setTeacherExams((await eRes.json()).exams || []);
      if (pRes?.ok) setParents((await pRes.json()).parents || []);
      if (admRes?.ok) setAdminTeam((await admRes.json()).admins || []);
    } catch {
      // handled cleanly
    }
  }, [apiFetch, newClsTeacherId, isRoleAdmin, isSuperAdmin]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  const pendingTeachers = useMemo(
    () => teachers.filter((tc) => tc.status === 'pending'),
    [teachers],
  );
  const rejectedTeachers = useMemo(
    () => teachers.filter((tc) => tc.status === 'rejected'),
    [teachers],
  );
  const filteredTeachers = useMemo(() => {
    const q = teacherSearch.trim().toLowerCase();
    return teachers.filter((tc) => {
      if (teacherStatusFilter !== 'all' && tc.status !== teacherStatusFilter) return false;
      if (!q) return true;
      return (
        tc.name.toLowerCase().includes(q) ||
        tc.email.toLowerCase().includes(q) ||
        (tc.phone || '').toLowerCase().includes(q)
      );
    });
  }, [teachers, teacherSearch, teacherStatusFilter]);

  const filteredParents = useMemo(() => {
    const q = familySearch.trim().toLowerCase();
    if (!q) return parents;
    return parents.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.children.some((c) => c.displayName.toLowerCase().includes(q)),
    );
  }, [parents, familySearch]);

  if (!authSession.authenticated || !isRoleAdmin) {
    return (
      <div className="max-w-lg mx-auto my-12 nono-card p-8 bg-white text-center space-y-4">
        <div className="flex justify-center">
          <NonoLandLogo variant="compact" size="sm" language={language} />
        </div>
        <Shield className="w-12 h-12 mx-auto text-[#FF6B6B]" />
        <h2 className="text-xl font-extrabold text-[#27345C]">
          {authSession.authenticated ? '403 — Admin Access Only' : '401 — Authentication Required'}
        </h2>
        <p className="text-xs font-bold text-[#27345C]/70">
          {authSession.authenticated
            ? `Your account role (${authSession.user?.role}) does not have administrator privileges.`
            : 'Please sign in with an authorized Administrator account to access System Administration.'}
        </p>
        <button
          type="button"
          onClick={() =>
            navigate(
              !authSession.authenticated
                ? 'parent-auth'
                : authSession.user?.role === 'teacher'
                  ? 'teacher-dashboard'
                  : 'parent-dashboard',
            )
          }
          className="px-6 py-2.5 rounded-xl bg-[#8054D9] text-white font-extrabold text-xs cursor-pointer"
        >
          {!authSession.authenticated
            ? language === 'ar' ? 'تسجيل الدخول' : 'Go to Sign In'
            : language === 'ar' ? 'العودة للوحة الحساب' : 'Back to Dashboard'}
        </button>
      </div>
    );
  }

  const renderStatusBadge = (status: AccountStatus) => {
    const labelMap: Record<AccountStatus, { ar: string; en: string; cls: string }> = {
      active: { ar: 'مفعّل', en: 'Active', cls: 'bg-[#55D98B]/25 text-[#14532D]' },
      pending: { ar: 'قيد المراجعة', en: 'Pending Approval', cls: 'bg-[#FFD84D]/60 text-[#78350F]' },
      rejected: { ar: 'مرفوض', en: 'Rejected', cls: 'bg-[#FF4D6D]/18 text-[#9F1239]' },
      suspended: { ar: 'موقوف', en: 'Suspended', cls: 'bg-slate-200 text-slate-700' },
    };
    const meta = labelMap[status] || labelMap.pending;
    return (
      <span className={`px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold ${meta.cls}`}>
        {language === 'ar' ? meta.ar : meta.en}
      </span>
    );
  };

  const handleApproveTeacher = async (teacher: AdminTeacherRow) => {
    setErrorMsg('');
    setNotice('');
    const res = await apiFetch(`/api/admin/teachers/${teacher.id}/approve`, {
      method: 'POST',
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setErrorMsg(d.error || 'Could not approve teacher');
    setNotice(
      language === 'ar'
        ? `تمت الموافقة على حساب المعلم (${teacher.name}) وتفعيله بنجاح ✓`
        : `Teacher ${teacher.name} approved and activated ✓`,
    );
    await loadAdminData();
  };

  const handleReactivateTeacher = async (teacher: AdminTeacherRow) => {
    setErrorMsg('');
    setNotice('');
    const res = await apiFetch(`/api/admin/teachers/${teacher.id}/reactivate`, {
      method: 'POST',
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setErrorMsg(d.error || 'Could not reactivate teacher');
    setNotice(
      language === 'ar'
        ? `تمت إعادة تفعيل حساب المعلم (${teacher.name}) بنجاح ✓`
        : `Teacher ${teacher.name} reactivated ✓`,
    );
    await loadAdminData();
  };

  const handleConfirmReasonAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reasonModal) return;
    setErrorMsg('');
    setNotice('');
    const endpoint =
      reasonModal.action === 'reject'
        ? `/api/admin/teachers/${reasonModal.teacher.id}/reject`
        : `/api/admin/teachers/${reasonModal.teacher.id}/suspend`;

    const res = await apiFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reasonInput.trim() || undefined }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setErrorMsg(d.error || 'Action failed');

    setNotice(
      reasonModal.action === 'reject'
        ? language === 'ar'
          ? `تم رفض طلب المعلم (${reasonModal.teacher.name}) وحفظ السبب.`
          : `Rejected teacher request for ${reasonModal.teacher.name}.`
        : language === 'ar'
          ? `تم تعليق حساب المعلم (${reasonModal.teacher.name}) وإلغاء جلساته النشطة.`
          : `Suspended teacher ${reasonModal.teacher.name} and revoked sessions.`,
    );
    setReasonModal(null);
    setReasonInput('');
    await loadAdminData();
  };

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setNotice('');
    const res = await apiFetch('/api/admin/teachers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: newTName,
        email: newTEmail,
        password: newTPassword,
        phone: newTPhone || undefined,
        status: 'active',
        permissions: DEFAULT_TEACHER_PERMISSIONS,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setErrorMsg(data.error || 'Could not create teacher');
    setNotice(
      language === 'ar'
        ? `تم إنشاء وتفعيل حساب المعلم: ${data.teacher.email}`
        : `Active teacher account created: ${data.teacher.email}`,
    );
    setNewTName('');
    setNewTEmail('');
    setNewTPassword('');
    setNewTPhone('');
    await loadAdminData();
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setNotice('');
    const res = await apiFetch('/api/admin/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: newAdmName,
        email: newAdmEmail,
        password: newAdmPassword,
        role: newAdmRole,
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setErrorMsg(d.error || 'Could not create admin account');
    setNotice(
      language === 'ar'
        ? `تم إنشاء حساب المسؤول (${d.admin.email}) بصلاحية ${d.admin.role}`
        : `Created ${d.admin.role} account: ${d.admin.email}`,
    );
    setNewAdmName('');
    setNewAdmEmail('');
    setNewAdmPassword('');
    await loadAdminData();
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const res = await apiFetch('/api/admin/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newClsName,
        subject: newClsSubject,
        level: newClsLevel,
        teacherId: newClsTeacherId,
        studentIds: newClsStudents,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setErrorMsg(data.error || 'Class creation failed');
    setNotice(`Created class: ${data.classroom?.name || newClsName}`);
    setNewClsName('');
    setNewClsStudents([]);
    await loadAdminData();
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-[2rem] bg-gradient-to-br from-[#1F2937] via-[#27345C] to-[#8054D9] text-white p-6 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <NonoLandLogo variant="compact" size="lg" showWordmark={false} tone="dark" language={language} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-[#FFD84D]">
                {language === 'ar' ? 'بوابة الإدارة المركزية · نونو لاند' : 'NonoLand Central Admin Portal'}
              </span>
              <span className="px-2 py-0.5 rounded-lg bg-white/15 text-[11px] font-extrabold text-[#55D98B]">
                {userRole}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold mt-1">
              {language === 'ar'
                ? 'إدارة الطلبات والمعلمين والعائلات والأمان (١–٤ سنوات)'
                : 'Teacher Approvals, Families, Classes & Security (Ages 1–4)'}
            </h1>
            <p className="text-xs text-white/75 mt-1">
              {authSession.user?.name} ({authSession.user?.email})
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLogoutModalOpen(true)}
            className="h-10 px-4 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>{language === 'ar' ? 'تسجيل الخروج' : 'Log Out'}</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl border border-[#27345C]/12">
        {[
          {
            id: 'overview' as const,
            label: language === 'ar' ? 'نظرة عامة' : 'Overview',
            icon: <LayoutDashboard className="w-4 h-4" />,
          },
          {
            id: 'requests' as const,
            label:
              language === 'ar'
                ? `طلبات تسجيل المعلمين (${pendingTeachers.length})`
                : `Teacher Requests (${pendingTeachers.length})`,
            icon: <Clock className="w-4 h-4" />,
            badge: pendingTeachers.length > 0 ? pendingTeachers.length : undefined,
          },
          {
            id: 'teachers' as const,
            label: language === 'ar' ? `المعلمون (${teachers.length})` : `Teachers (${teachers.length})`,
            icon: <UserCheck className="w-4 h-4" />,
          },
          {
            id: 'families' as const,
            label: language === 'ar' ? `الأهل والأطفال (${parents.length})` : `Parents & Children (${parents.length})`,
            icon: <Users className="w-4 h-4" />,
          },
          {
            id: 'classes' as const,
            label: language === 'ar' ? `الفصول والطلاب (${classes.length})` : `Classes (${classes.length})`,
            icon: <Layers className="w-4 h-4" />,
          },
          {
            id: 'exams' as const,
            label: language === 'ar' ? `الامتحانات (${teacherExams.length})` : `Exams (${teacherExams.length})`,
            icon: <ClipboardCheck className="w-4 h-4" />,
          },
          {
            id: 'governance' as const,
            label: language === 'ar' ? 'جودة المحتوى' : 'Governance',
            icon: <CheckCircle2 className="w-4 h-4" />,
          },
          {
            id: 'ops' as const,
            label: language === 'ar' ? 'التدقيق والميزات' : 'Audit & Ops',
            icon: <Shield className="w-4 h-4" />,
          },
          {
            id: 'cms' as const,
            label: language === 'ar' ? 'المحتوى والشهادات' : 'CMS',
            icon: <Settings className="w-4 h-4" />,
          },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors ${
              tab === item.id
                ? 'bg-[#27345C] text-white'
                : item.badge
                  ? 'bg-[#FFF3CD] text-[#78350F] hover:bg-[#FFE69C]'
                  : 'text-[#27345C]/75 hover:bg-[#FFF8E9]'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {notice && (
        <div className="p-3.5 rounded-2xl bg-[#55D98B]/20 border border-[#55D98B] text-[#14532D] text-xs font-extrabold">
          {notice}
        </div>
      )}
      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-[#FF4D6D]/15 border border-[#FF4D6D]/40 text-[#991B1B] text-xs font-extrabold">
          {errorMsg}
        </div>
      )}

      {/* ===============================================================
          TAB 1: OVERVIEW STATS
         =============================================================== */}
      {tab === 'overview' && (
        <div className="space-y-5">
          {pendingTeachers.length > 0 && (
            <div className="p-4 rounded-2xl bg-[#FFF3CD] border-2 border-[#FFD84D] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-[#B45309] shrink-0" />
                <div>
                  <p className="text-sm font-extrabold text-[#27345C]">
                    {language === 'ar'
                      ? `يوجد ${pendingTeachers.length} طلب تسجيل معلم بانتظار المراجعة والموافقة`
                      : `${pendingTeachers.length} teacher application(s) waiting for admin approval`}
                  </p>
                  <p className="text-xs font-semibold text-[#27345C]/75">
                    {language === 'ar'
                      ? 'لا يمكن للمعلمين الجدد تسجيل الدخول حتى يتم اعتماد حسابهم من الإدارة.'
                      : 'Pending teachers cannot sign in until an administrator reviews and approves them.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTab('requests')}
                className="px-4 py-2 rounded-xl bg-[#27345C] text-white text-xs font-extrabold cursor-pointer"
              >
                {language === 'ar' ? 'مراجعة الطلبات الآن' : 'Review Pending Requests'}
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: language === 'ar' ? 'أولياء الأمور / العائلات' : 'Parents / Families',
                value: overviewStats?.totalParents ?? parents.length,
                bg: 'bg-[#E5F6FF] border-[#39BDF2]/40',
              },
              {
                label: language === 'ar' ? 'ملفات الأطفال (١–٤)' : 'Children (Ages 1–4)',
                value: overviewStats?.totalChildren ?? students.length,
                bg: 'bg-[#EFE7FF] border-[#8054D9]/35',
              },
              {
                label: language === 'ar' ? 'طلبات معلمين معلّقة' : 'Pending Teachers',
                value: overviewStats?.pendingTeachers ?? pendingTeachers.length,
                bg: 'bg-[#FFF3CD] border-[#FFD84D]',
              },
              {
                label: language === 'ar' ? 'معلمون مفعّلون' : 'Active Teachers',
                value: overviewStats?.activeTeachers ?? teachers.filter((x) => x.status === 'active').length,
                bg: 'bg-[#E2F9EC] border-[#55D98B]',
              },
              {
                label: language === 'ar' ? 'طلبات مرفوضة' : 'Rejected Requests',
                value: overviewStats?.rejectedTeachers ?? rejectedTeachers.length,
                bg: 'bg-[#FFE8EE] border-[#FF4D6D]/35',
              },
              {
                label: language === 'ar' ? 'حسابات موقوفة' : 'Suspended Teachers',
                value: overviewStats?.suspendedTeachers ?? teachers.filter((x) => x.status === 'suspended').length,
                bg: 'bg-slate-100 border-slate-300',
              },
              {
                label: language === 'ar' ? 'الفصول النشطة' : 'Active Classes',
                value: overviewStats?.activeClasses ?? classes.filter((c) => c.active).length,
                bg: 'bg-white border-[#27345C]/15',
              },
              {
                label: language === 'ar' ? 'سجلات التدقيق الأمني' : 'Audit Log Entries',
                value: overviewStats?.auditLogsCount ?? 0,
                bg: 'bg-white border-[#27345C]/15',
              },
            ].map((card, i) => (
              <div key={i} className={`nono-card p-4 border ${card.bg} space-y-1`}>
                <p className="text-xs font-extrabold text-[#27345C]/70">{card.label}</p>
                <p className="text-2xl font-extrabold text-[#27345C] tabular-nums">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="nono-card p-5 bg-white space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold text-[#27345C]">
                  {language === 'ar' ? 'أحدث طلبات المعلمين المعلقة' : 'Latest Pending Teacher Requests'}
                </h3>
                <button
                  type="button"
                  onClick={() => setTab('requests')}
                  className="text-xs font-extrabold text-[#8054D9] underline cursor-pointer"
                >
                  {language === 'ar' ? 'عرض الكل' : 'View All'}
                </button>
              </div>
              {pendingTeachers.length === 0 ? (
                <p className="text-xs font-bold text-[#27345C]/60 py-4">
                  {language === 'ar'
                    ? 'لا توجد طلبات معلمين معلقة حالياً.'
                    : 'No pending teacher requests right now.'}
                </p>
              ) : (
                pendingTeachers.slice(0, 4).map((tc) => (
                  <div
                    key={tc.id}
                    className="p-3 rounded-xl bg-[#FFF8E9] border border-[#27345C]/12 flex items-center justify-between gap-2 text-xs font-bold"
                  >
                    <div>
                      <p className="font-extrabold text-[#27345C]">{tc.name}</p>
                      <p className="text-[#27345C]/65">{tc.email}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleApproveTeacher(tc)}
                        className="px-2.5 py-1 rounded-lg bg-[#55D98B] text-[#27345C] font-extrabold cursor-pointer"
                      >
                        {language === 'ar' ? 'موافقة' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReasonModal({ action: 'reject', teacher: tc });
                          setReasonInput('');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#FF4D6D]/15 text-[#9F1239] font-extrabold cursor-pointer"
                      >
                        {language === 'ar' ? 'رفض' : 'Reject'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="nono-card p-5 bg-white space-y-3">
              <h3 className="text-base font-extrabold text-[#27345C]">
                {language === 'ar' ? 'إجراءات إدارية سريعة' : 'Quick Administration Actions'}
              </h3>
              <div className="grid grid-cols-2 gap-2.5 text-xs font-extrabold">
                <button
                  type="button"
                  onClick={() => setTab('requests')}
                  className="p-3 rounded-xl bg-[#FFF3CD] text-[#78350F] text-start cursor-pointer hover:brightness-95"
                >
                  {language === 'ar' ? 'طلبات المعلمين المعلقة' : 'Pending Teacher Requests'}
                </button>
                <button
                  type="button"
                  onClick={() => setTab('teachers')}
                  className="p-3 rounded-xl bg-[#E5F6FF] text-[#0369A1] text-start cursor-pointer hover:brightness-95"
                >
                  {language === 'ar' ? 'إدارة المعلمين والفصول' : 'Manage Teachers & Classes'}
                </button>
                <button
                  type="button"
                  onClick={() => setTab('families')}
                  className="p-3 rounded-xl bg-[#EFE7FF] text-[#5B21B6] text-start cursor-pointer hover:brightness-95"
                >
                  {language === 'ar' ? 'دليل الأهل والأطفال' : 'Parents & Children Directory'}
                </button>
                <button
                  type="button"
                  onClick={() => setTab('ops')}
                  className="p-3 rounded-xl bg-[#E2F9EC] text-[#14532D] text-start cursor-pointer hover:brightness-95"
                >
                  {language === 'ar' ? 'سجلات التدقيق الأمني' : 'Security Audit Logs'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===============================================================
          TAB 2: TEACHER APPROVAL MANAGEMENT ("طلبات تسجيل المعلمين")
         =============================================================== */}
      {tab === 'requests' && (
        <div className="space-y-5">
          <div className="nono-card p-5 bg-white space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold text-[#27345C]">
                {language === 'ar'
                  ? `طلبات تسجيل المعلمين قيد المراجعة (${pendingTeachers.length})`
                  : `Pending Teacher Registration Requests (${pendingTeachers.length})`}
              </h2>
            </div>

            {pendingTeachers.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[#FFF8E9] text-center text-xs font-bold text-[#27345C]/70">
                {language === 'ar'
                  ? 'لا توجد طلبات معلمين معلقة الآن — جميع الطلبات تمت مراجعتها.'
                  : 'Zero pending teacher applications at this time.'}
              </div>
            ) : (
              <div className="space-y-3">
                {pendingTeachers.map((tc) => (
                  <div
                    key={tc.id}
                    className="p-4 rounded-2xl border-2 border-[#FFD84D]/70 bg-[#FFF8E9]/60 flex flex-wrap items-center justify-between gap-3 text-xs font-bold"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-extrabold text-[#27345C]">{tc.name}</span>
                        {renderStatusBadge(tc.status)}
                      </div>
                      <p className="text-[#27345C]/75">
                        {tc.email} {tc.phone ? `· ${tc.phone}` : ''}
                      </p>
                      <p className="text-[#27345C]/65">
                        {language === 'ar' ? 'تاريخ الطلب:' : 'Submitted:'}{' '}
                        {tc.createdAt ? new Date(tc.createdAt).toLocaleString() : '—'}
                        {' · '}
                        {language === 'ar' ? 'المواد:' : 'Subjects:'}{' '}
                        {(tc.teacherProfile?.subjects || []).join(', ') || '—'}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailTeacher(tc)}
                        className="px-3 py-2 rounded-xl bg-white border border-[#27345C]/20 text-[#27345C] font-extrabold flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'التفاصيل' : 'Details'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleApproveTeacher(tc)}
                        className="px-3.5 py-2 rounded-xl bg-[#55D98B] text-[#14532D] font-extrabold flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'موافقة وتفعيل' : 'Approve Teacher'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReasonModal({ action: 'reject', teacher: tc });
                          setReasonInput('');
                        }}
                        className="px-3.5 py-2 rounded-xl bg-[#FF4D6D]/18 text-[#9F1239] font-extrabold flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'رفض الطلب' : 'Reject'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {rejectedTeachers.length > 0 && (
            <div className="nono-card p-5 bg-white space-y-3">
              <h3 className="text-base font-extrabold text-[#27345C]">
                {language === 'ar'
                  ? `سجل طلبات المعلمين المرفوضة (${rejectedTeachers.length})`
                  : `Rejected Teacher Applications (${rejectedTeachers.length})`}
              </h3>
              <div className="space-y-2.5">
                {rejectedTeachers.map((tc) => (
                  <div
                    key={tc.id}
                    className="p-3.5 rounded-2xl border border-[#FF4D6D]/25 bg-[#FFF5F7] flex flex-wrap items-center justify-between gap-3 text-xs font-bold"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-[#27345C]">{tc.name}</span>
                        {renderStatusBadge(tc.status)}
                      </div>
                      <p className="text-[#27345C]/70">{tc.email}</p>
                      {tc.teacherProfile?.rejectionReason && (
                        <p className="text-[#9F1239]">
                          {language === 'ar' ? 'سبب الرفض:' : 'Reason:'} {tc.teacherProfile.rejectionReason}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailTeacher(tc)}
                        className="px-3 py-1.5 rounded-lg bg-white border border-[#27345C]/15 cursor-pointer"
                      >
                        {language === 'ar' ? 'التفاصيل' : 'Details'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleApproveTeacher(tc)}
                        className="px-3 py-1.5 rounded-lg bg-[#55D98B] text-[#14532D] font-extrabold cursor-pointer"
                      >
                        {language === 'ar' ? 'إعادة القبول والتفعيل' : 'Approve & Activate'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===============================================================
          TAB 3: TEACHER MANAGEMENT
         =============================================================== */}
      {tab === 'teachers' && (
        <div className="space-y-5">
          <form
            onSubmit={(e) => void handleCreateTeacher(e)}
            className="nono-card p-5 bg-white space-y-3 text-xs font-bold"
          >
            <h3 className="text-base font-extrabold text-[#27345C] flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-[#8054D9]" />
              <span>{language === 'ar' ? 'إنشاء حساب معلم نشط مباشرة' : 'Create Approved Teacher Account'}</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <input
                required
                placeholder={language === 'ar' ? 'الاسم الكامل' : 'Full Name'}
                value={newTName}
                onChange={(e) => setNewTName(e.target.value)}
                className="h-10 px-3 rounded-xl border border-[#27345C]/20"
              />
              <input
                required
                type="email"
                placeholder={language === 'ar' ? 'البريد الإلكتروني' : 'Teacher Email'}
                value={newTEmail}
                onChange={(e) => setNewTEmail(e.target.value)}
                className="h-10 px-3 rounded-xl border border-[#27345C]/20"
              />
              <input
                required
                type="password"
                placeholder={language === 'ar' ? 'كلمة مرور قوية (١٢+ حرفاً)' : 'Strong Password (12+ chars)'}
                value={newTPassword}
                onChange={(e) => setNewTPassword(e.target.value)}
                className="h-10 px-3 rounded-xl border border-[#27345C]/20"
              />
              <input
                placeholder={language === 'ar' ? 'الهاتف (اختياري)' : 'Phone (+20...)'}
                value={newTPhone}
                onChange={(e) => setNewTPhone(e.target.value)}
                className="h-10 px-3 rounded-xl border border-[#27345C]/20"
              />
            </div>
            <button
              type="submit"
              className="nono-btn-tactile px-5 py-2 rounded-xl bg-[#8054D9] text-white font-extrabold cursor-pointer"
            >
              {language === 'ar' ? 'إنشاء وتفعيل المعلم' : 'Create Active Teacher'}
            </button>
          </form>

          <div className="nono-card p-5 bg-white space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-extrabold text-[#27345C]">
                {language === 'ar' ? 'دليل إدارة المعلمين' : 'Teacher Directory & Governance'}
              </h3>
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#27345C]/50 absolute top-2.5 start-3" />
                  <input
                    type="text"
                    value={teacherSearch}
                    onChange={(e) => setTeacherSearch(e.target.value)}
                    placeholder={language === 'ar' ? 'بحث بالاسم أو البريد...' : 'Search name or email...'}
                    className="h-9 ps-8 pe-3 rounded-xl border border-[#27345C]/20 bg-white"
                  />
                </div>
                <select
                  value={teacherStatusFilter}
                  onChange={(e) => setTeacherStatusFilter(e.target.value as 'all' | AccountStatus)}
                  className="h-9 px-3 rounded-xl border border-[#27345C]/20 bg-white"
                >
                  <option value="all">{language === 'ar' ? 'كل الحالات' : 'All Statuses'}</option>
                  <option value="active">{language === 'ar' ? 'مفعّل' : 'Active'}</option>
                  <option value="pending">{language === 'ar' ? 'قيد المراجعة' : 'Pending'}</option>
                  <option value="rejected">{language === 'ar' ? 'مرفوض' : 'Rejected'}</option>
                  <option value="suspended">{language === 'ar' ? 'موقوف' : 'Suspended'}</option>
                </select>
              </div>
            </div>

            {filteredTeachers.length === 0 ? (
              <p className="text-center py-6 text-xs font-bold text-[#27345C]/60">
                {language === 'ar' ? 'لا يوجد معلمون مطابقون للبحث.' : 'No teachers match the current filter.'}
              </p>
            ) : (
              filteredTeachers.map((tc) => (
                <div
                  key={tc.id}
                  className="p-4 rounded-2xl border border-[#27345C]/12 bg-[#FFF8E9]/45 flex flex-wrap items-center justify-between gap-3 text-xs font-bold"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-sm text-[#27345C]">{tc.name}</span>
                      {renderStatusBadge(tc.status)}
                    </div>
                    <p className="text-[#27345C]/70">
                      {tc.email} · {language === 'ar' ? 'الفصول:' : 'Classes:'} {tc.classesCount} ·{' '}
                      {language === 'ar' ? 'الأسئلة:' : 'Qs:'} {tc.questionsCount} ·{' '}
                      {language === 'ar' ? 'الامتحانات:' : 'Exams:'} {tc.examsCount}
                    </p>
                    {tc.assignedClasses && tc.assignedClasses.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {tc.assignedClasses.map((ac) => (
                          <span
                            key={ac.id}
                            className="px-2 py-0.5 rounded bg-white border border-[#27345C]/12 text-[11px]"
                          >
                            {ac.name} ({ac.studentCount})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setDetailTeacher(tc)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-[#27345C]/15 cursor-pointer"
                    >
                      {language === 'ar' ? 'التفاصيل' : 'Details'}
                    </button>
                    {tc.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleApproveTeacher(tc)}
                          className="px-3 py-1.5 rounded-lg bg-[#55D98B] text-[#14532D] font-extrabold cursor-pointer"
                        >
                          {language === 'ar' ? 'موافقة' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReasonModal({ action: 'reject', teacher: tc });
                            setReasonInput('');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#FF4D6D]/18 text-[#9F1239] font-extrabold cursor-pointer"
                        >
                          {language === 'ar' ? 'رفض' : 'Reject'}
                        </button>
                      </>
                    )}
                    {(tc.status === 'suspended' || tc.status === 'rejected') && (
                      <button
                        type="button"
                        onClick={() => void handleReactivateTeacher(tc)}
                        className="px-3 py-1.5 rounded-lg bg-[#55D98B] text-[#14532D] font-extrabold cursor-pointer"
                      >
                        {language === 'ar' ? 'إعادة التفعيل' : 'Reactivate'}
                      </button>
                    )}
                    {tc.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => {
                          setReasonModal({ action: 'suspend', teacher: tc });
                          setReasonInput('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#FF6B6B]/20 text-[#991B1B] font-extrabold flex items-center gap-1 cursor-pointer"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'تعليق' : 'Suspend'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        const r = await apiFetch(`/api/admin/teachers/${tc.id}/activity`);
                        if (r.ok) {
                          setActivityTeacherName(tc.name);
                          setTeacherActivityLogs((await r.json()).logs || []);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white border border-[#27345C]/15 cursor-pointer"
                    >
                      {language === 'ar' ? 'السجل' : 'Activity Log'}
                    </button>
                  </div>
                </div>
              ))
            )}
            {teacherActivityLogs.length > 0 && (
              <div className="p-4 rounded-2xl bg-[#E5F6FF] space-y-1.5 text-xs font-bold">
                <p className="font-extrabold">
                  {language === 'ar' ? 'سجل نشاط المعلم:' : 'Activity Logs —'} {activityTeacherName}
                </p>
                {teacherActivityLogs.slice(0, 10).map((lg) => (
                  <p key={lg.id}>
                    {new Date(lg.createdAt).toLocaleString()} — {lg.summary}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===============================================================
          TAB 4: PARENTS & CHILDREN + SUPER ADMIN TEAM MANAGEMENT
         =============================================================== */}
      {tab === 'families' && (
        <div className="space-y-5">
          {isSuperAdmin && (
            <div className="nono-card p-5 bg-white space-y-4">
              <h3 className="text-base font-extrabold text-[#27345C] flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#8054D9]" />
                <span>
                  {language === 'ar'
                    ? 'فريق الإدارة (للمشرف العام فقط)'
                    : 'Administrator Accounts (Super Admin Only)'}
                </span>
              </h3>

              <form onSubmit={(e) => void handleCreateAdmin(e)} className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs font-bold">
                <input
                  required
                  placeholder={language === 'ar' ? 'اسم المسؤول' : 'Admin Name'}
                  value={newAdmName}
                  onChange={(e) => setNewAdmName(e.target.value)}
                  className="h-10 px-3 rounded-xl border border-[#27345C]/20"
                />
                <input
                  required
                  type="email"
                  placeholder={language === 'ar' ? 'البريد الإلكتروني' : 'Admin Email'}
                  value={newAdmEmail}
                  onChange={(e) => setNewAdmEmail(e.target.value)}
                  className="h-10 px-3 rounded-xl border border-[#27345C]/20"
                />
                <input
                  required
                  type="password"
                  placeholder={language === 'ar' ? 'كلمة مرور قوية (١٢+)' : 'Strong Password (12+)'}
                  value={newAdmPassword}
                  onChange={(e) => setNewAdmPassword(e.target.value)}
                  className="h-10 px-3 rounded-xl border border-[#27345C]/20"
                />
                <select
                  value={newAdmRole}
                  onChange={(e) => setNewAdmRole(e.target.value as UserRole)}
                  className="h-10 px-3 rounded-xl border border-[#27345C]/20 bg-white"
                >
                  <option value="admin">admin</option>
                  <option value="content_admin">content_admin</option>
                  <option value="curriculum_manager">curriculum_manager</option>
                  <option value="finance_admin">finance_admin</option>
                  <option value="support_agent">support_agent</option>
                </select>
                <button
                  type="submit"
                  className="h-10 px-4 rounded-xl bg-[#1F2937] text-white font-extrabold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{language === 'ar' ? 'إضافة مسؤول' : 'Create Admin'}</span>
                </button>
              </form>

              <div className="space-y-2 text-xs font-bold">
                {adminTeam.map((adm) => (
                  <div
                    key={adm.id}
                    className="p-3 rounded-xl bg-[#FFF8E9]/70 border border-[#27345C]/12 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-extrabold text-[#27345C]">{adm.name}</span>{' '}
                      <span className="text-[#27345C]/65">({adm.email})</span>
                      <span className="ms-2 px-2 py-0.5 rounded bg-[#27345C] text-white text-[10px]">
                        {adm.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {renderStatusBadge(adm.status)}
                      {adm.role !== 'super_admin' && (
                        <button
                          type="button"
                          onClick={async () => {
                            const nextStatus = adm.status === 'active' ? 'suspended' : 'active';
                            const r = await apiFetch(`/api/admin/admins/${adm.id}/status`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ status: nextStatus }),
                            });
                            if (r.ok) await loadAdminData();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white border border-[#27345C]/20 cursor-pointer"
                        >
                          {adm.status === 'active'
                            ? language === 'ar'
                              ? 'تعليق'
                              : 'Suspend'
                            : language === 'ar'
                              ? 'تفعيل'
                              : 'Activate'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="nono-card p-5 bg-white space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-extrabold text-[#27345C]">
                {language === 'ar'
                  ? `أولياء الأمور والأطفال المسجلون (${parents.length})`
                  : `Registered Parents & Children (${parents.length})`}
              </h3>
              <div className="relative text-xs font-bold">
                <Search className="w-3.5 h-3.5 text-[#27345C]/50 absolute top-2.5 start-3" />
                <input
                  type="text"
                  value={familySearch}
                  onChange={(e) => setFamilySearch(e.target.value)}
                  placeholder={language === 'ar' ? 'بحث بالاسم أو البريد أو اسم الطفل...' : 'Search parent, email, child...'}
                  className="h-9 ps-8 pe-3 rounded-xl border border-[#27345C]/20 bg-white w-64"
                />
              </div>
            </div>

            {filteredParents.length === 0 ? (
              <p className="text-center py-6 text-xs font-bold text-[#27345C]/60">
                {language === 'ar' ? 'لا توجد حسابات أولياء أمور مطابقة.' : 'No matching parent accounts found.'}
              </p>
            ) : (
              <div className="space-y-3 text-xs font-bold">
                {filteredParents.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 rounded-2xl border border-[#27345C]/12 bg-[#FFF8E9]/50 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-extrabold text-[#27345C]">{p.name}</span>
                        <span className="ms-2 text-[#27345C]/65">{p.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {renderStatusBadge(p.status)}
                        <span className="px-2 py-0.5 rounded bg-[#EFE7FF] text-[#5B21B6]">
                          {p.childrenCount} {language === 'ar' ? 'طفل' : 'child(ren)'}
                        </span>
                      </div>
                    </div>
                    {p.children.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {p.children.map((ch) => (
                          <span
                            key={ch.id}
                            className="px-2.5 py-1 rounded-lg bg-white border border-[#27345C]/12"
                          >
                            {ch.displayName} · {ch.ageGroup} · L{ch.level} · ★{ch.stars}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===============================================================
          TAB 5: CLASSES & STUDENTS
         =============================================================== */}
      {tab === 'classes' && (
        <div className="space-y-5">
          <form onSubmit={(e) => void handleCreateClass(e)} className="nono-card p-5 bg-white space-y-3 text-xs font-bold">
            <h3 className="text-base font-extrabold text-[#27345C]">
              {language === 'ar' ? 'إنشاء فصل وإسناد معلم وطلاب' : 'Create Class & Assign Teacher + Students'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <input
                required
                placeholder="Class Name (e.g. Little Explorers A)"
                value={newClsName}
                onChange={(e) => setNewClsName(e.target.value)}
                className="h-10 px-3 rounded-xl border border-[#27345C]/20"
              />
              <input
                placeholder="Subject"
                value={newClsSubject}
                onChange={(e) => setNewClsSubject(e.target.value)}
                className="h-10 px-3 rounded-xl border border-[#27345C]/20"
              />
              <select
                value={newClsLevel}
                onChange={(e) => setNewClsLevel(e.target.value === 'all' ? 'all' : 1)}
                className="h-10 px-3 rounded-xl border border-[#27345C]/20 bg-white"
              >
                <option value={1}>Foundations (Ages 1–4)</option>
                <option value="all">All Ages 1–4 Tracks</option>
              </select>
              <select
                required
                value={newClsTeacherId}
                onChange={(e) => setNewClsTeacherId(e.target.value)}
                className="h-10 px-3 rounded-xl border border-[#27345C]/20 bg-white"
              >
                <option value="">-- Assign Teacher --</option>
                {teachers.map((tc) => (
                  <option key={tc.id} value={tc.id}>
                    {tc.name} ({tc.status})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              {students.map((st) => {
                const picked = newClsStudents.includes(st.id);
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() =>
                      setNewClsStudents((prev) =>
                        picked ? prev.filter((x) => x !== st.id) : [...prev, st.id],
                      )
                    }
                    className={`px-2.5 py-1 rounded-lg border cursor-pointer ${
                      picked ? 'bg-[#8054D9] text-white' : 'bg-[#FFF8E9]'
                    }`}
                  >
                    {st.displayName} ({st.ageGroup})
                  </button>
                );
              })}
            </div>
            <button
              type="submit"
              className="nono-btn-tactile px-5 py-2 rounded-xl bg-[#55D98B] text-[#27345C] font-extrabold cursor-pointer"
            >
              {language === 'ar' ? 'إنشاء الفصل' : 'Create Class'}
            </button>
          </form>

          <div className="nono-card p-5 bg-white space-y-3">
            {classes.map((cls) => (
              <div
                key={cls.id}
                className="p-4 rounded-2xl border border-[#27345C]/12 bg-[#FFF8E9]/45 space-y-2 text-xs font-bold"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="font-extrabold text-sm text-[#27345C]">{cls.name}</h4>
                    <p>
                      Teacher: {cls.teacherName} · Subject: {cls.subject} · Level: {cls.level}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/classes/${cls.id}`, { method: 'DELETE' });
                        await loadAdminData();
                      }}
                      className="p-1.5 rounded-lg bg-[#FF6B6B]/15 text-[#991B1B] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {cls.studentIds.map((sid, idx) => (
                    <span
                      key={sid}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border"
                    >
                      {cls.studentNames[idx] || sid}
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/classes/${cls.id}/students/${sid}`, {
                            method: 'DELETE',
                          });
                          await loadAdminData();
                        }}
                        className="text-[#991B1B] font-extrabold cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <select
                    value={addStuMap[cls.id] || ''}
                    onChange={(e) => setAddStuMap((p) => ({ ...p, [cls.id]: e.target.value }))}
                    className="h-8 px-2 rounded-lg border bg-white"
                  >
                    <option value="">+ Add Student</option>
                    {students
                      .filter((st) => !cls.studentIds.includes(st.id))
                      .map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.displayName}
                        </option>
                      ))}
                  </select>
                  {addStuMap[cls.id] && (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/classes/${cls.id}/students`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ studentId: addStuMap[cls.id] }),
                        });
                        setAddStuMap((p) => ({ ...p, [cls.id]: '' }));
                        await loadAdminData();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#8054D9] text-white cursor-pointer"
                    >
                      Add
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===============================================================
          TAB 6: TEACHER EXAMS REVIEW
         =============================================================== */}
      {tab === 'exams' && (
        <div className="nono-card p-5 bg-white space-y-3 text-xs font-bold">
          <h3 className="text-base font-extrabold text-[#27345C]">
            {language === 'ar' ? 'مراجعة امتحانات المعلمين' : 'Teacher Exams Governance Queue'}
          </h3>
          {teacherExams.map((ex) => (
            <div
              key={ex.id}
              className="p-4 rounded-2xl border border-[#27345C]/12 flex flex-wrap justify-between items-center gap-2"
            >
              <div>
                <p className="font-extrabold text-sm">
                  {t(ex.title, language)} ({ex.status})
                </p>
                <p>
                  By {ex.teacherName} · L{ex.level} · {ex.subject} · {ex.totalQuestions} Qs
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/admin/exams/${ex.id}/review`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'published' }),
                    });
                    await loadAdminData();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#55D98B] text-[#27345C] font-extrabold cursor-pointer"
                >
                  Approve / Publish
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/admin/exams/${ex.id}/review`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'suspended' }),
                    });
                    await loadAdminData();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#FF6B6B]/15 text-[#991B1B] cursor-pointer"
                >
                  Suspend
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CONTENT GOVERNANCE & QUALITY AUDIT */}
      {tab === 'governance' && (
        <AdminGovernancePanel apiFetch={apiFetch} onNotice={setNotice} onError={setErrorMsg} />
      )}

      {/* FEATURE FLAGS, OPS, INTEGRITY, BACKUP & AUDIT LOGS */}
      {tab === 'ops' && (
        <AdminOpsPanel apiFetch={apiFetch} onNotice={setNotice} onError={setErrorMsg} />
      )}

      {/* EXISTING ADMIN CMS PANEL */}
      {tab === 'cms' && <AdminCmsPanel language={language} />}

      {/* ===============================================================
          MODAL: TEACHER DETAILS
         =============================================================== */}
      {detailTeacher && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <div className="nono-card rounded-3xl p-6 bg-white max-w-md w-full space-y-3 text-xs font-bold">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-extrabold text-[#27345C]">{detailTeacher.name}</h3>
              {renderStatusBadge(detailTeacher.status)}
            </div>
            <div className="space-y-1.5 text-[#27345C]/80">
              <p>
                <strong>{language === 'ar' ? 'البريد:' : 'Email:'}</strong> {detailTeacher.email}
              </p>
              <p>
                <strong>{language === 'ar' ? 'الهاتف:' : 'Phone:'}</strong> {detailTeacher.phone || '—'}
              </p>
              <p>
                <strong>{language === 'ar' ? 'تاريخ التسجيل:' : 'Registered:'}</strong>{' '}
                {detailTeacher.createdAt ? new Date(detailTeacher.createdAt).toLocaleString() : '—'}
              </p>
              <p>
                <strong>{language === 'ar' ? 'المواد:' : 'Subjects:'}</strong>{' '}
                {(detailTeacher.teacherProfile?.subjects || []).join(', ') || '—'}
              </p>
              {detailTeacher.bio && (
                <p>
                  <strong>{language === 'ar' ? 'النبذة:' : 'Bio:'}</strong> {detailTeacher.bio}
                </p>
              )}
              {detailTeacher.teacherProfile?.approvedAt && (
                <p className="text-[#14532D]">
                  <strong>{language === 'ar' ? 'تاريخ الاعتماد:' : 'Approved At:'}</strong>{' '}
                  {new Date(detailTeacher.teacherProfile.approvedAt).toLocaleString()}
                </p>
              )}
              {detailTeacher.teacherProfile?.rejectionReason && (
                <p className="text-[#9F1239]">
                  <strong>{language === 'ar' ? 'سبب الرفض:' : 'Rejection Reason:'}</strong>{' '}
                  {detailTeacher.teacherProfile.rejectionReason}
                </p>
              )}
              {detailTeacher.teacherProfile?.suspensionReason && (
                <p className="text-[#991B1B]">
                  <strong>{language === 'ar' ? 'سبب التعليق:' : 'Suspension Reason:'}</strong>{' '}
                  {detailTeacher.teacherProfile.suspensionReason}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDetailTeacher(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-[#27345C] font-extrabold cursor-pointer"
              >
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===============================================================
          MODAL: REJECT / SUSPEND REASON
         =============================================================== */}
      {reasonModal && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <form
            onSubmit={(e) => void handleConfirmReasonAction(e)}
            className="nono-card rounded-3xl p-6 bg-white max-w-md w-full space-y-4 text-xs font-bold"
          >
            <h3 className="text-lg font-extrabold text-[#27345C]">
              {reasonModal.action === 'reject'
                ? language === 'ar'
                  ? `رفض طلب المعلم: ${reasonModal.teacher.name}`
                  : `Reject Teacher Application: ${reasonModal.teacher.name}`
                : language === 'ar'
                  ? `تعليق حساب المعلم: ${reasonModal.teacher.name}`
                  : `Suspend Teacher Account: ${reasonModal.teacher.name}`}
            </h3>
            <div>
              <label className="block mb-1.5 text-[#27345C]">
                {language === 'ar' ? 'السبب (اختياري ويُحفظ في سجل التدقيق)' : 'Reason (saved in record & audit log)'}
              </label>
              <textarea
                rows={3}
                maxLength={300}
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder={
                  language === 'ar'
                    ? 'اكتب سبب الرفض أو التعليق...'
                    : 'Provide a clear administrative reason...'
                }
                className="w-full p-3 rounded-xl border border-[#27345C]/20 bg-[#FFF8E9]"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReasonModal(null)}
                className="flex-1 h-10 rounded-xl bg-slate-100 text-[#27345C] font-extrabold cursor-pointer"
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="flex-1 h-10 rounded-xl bg-[#FF4D6D] text-white font-extrabold cursor-pointer"
              >
                {reasonModal.action === 'reject'
                  ? language === 'ar'
                    ? 'تأكيد الرفض'
                    : 'Confirm Rejection'
                  : language === 'ar'
                    ? 'تأكيد التعليق'
                    : 'Confirm Suspension'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===============================================================
          MODAL: LOGOUT CONFIRMATION
         =============================================================== */}
      {logoutModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <div className="nono-card rounded-3xl p-6 bg-white max-w-sm w-full space-y-4 text-center">
            <h2 className="text-lg font-extrabold text-[#27345C]">
              {language === 'ar' ? 'تأكيد تسجيل الخروج' : 'Confirm Log Out'}
            </h2>
            <p className="text-xs font-bold text-[#27345C]/75">
              {language === 'ar'
                ? 'هل تريد تسجيل الخروج من لوحة الإدارة؟ سيتم إبطال الجلسة على الخادم بأمان.'
                : 'Are you sure you want to log out of System Administration?'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLogoutModalOpen(false)}
                className="flex-1 h-11 rounded-2xl bg-slate-100 text-[#27345C] font-extrabold text-xs cursor-pointer"
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setLogoutModalOpen(false);
                  await logoutParent();
                  navigate('parent-auth');
                }}
                className="flex-1 h-11 rounded-2xl bg-[#FF4D6D] text-white font-extrabold text-xs cursor-pointer"
              >
                {language === 'ar' ? 'نعم، تسجيل الخروج' : 'Yes, Log Out'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
