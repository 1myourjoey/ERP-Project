import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import GoogleLoginButton from '../components/GoogleLoginButton'
import PageHeader from '../components/common/page/PageHeader'
import PageMetricStrip from '../components/common/page/PageMetricStrip'
import SectionScaffold from '../components/common/page/SectionScaffold'
import { useAuth } from '../contexts/AuthContext'
import { AUTH_DISABLED } from '../lib/authMode'

export default function MyProfilePage() {
  const navigate = useNavigate()
  const { user, updateProfile, changePassword, linkGoogle, unlinkGoogle, logoutAll } = useAuth()

  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [department, setDepartment] = useState(user?.department ?? '')
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? '')

  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [sessionBusy, setSessionBusy] = useState(false)

  const onSubmitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setProfileSaving(true)
    setProfileMessage(null)
    setProfileError(null)
    try {
      await updateProfile({
        name: name.trim() || null,
        email: email.trim() || null,
        department: department.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      })
      setProfileMessage('프로필을 저장했습니다.')
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : '프로필 저장에 실패했습니다.')
    } finally {
      setProfileSaving(false)
    }
  }

  const onSubmitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPasswordMessage(null)
    setPasswordError(null)
    if (!currentPassword || !newPassword || !newPasswordConfirm) {
      setPasswordError('모든 비밀번호 항목을 입력해 주세요.')
      return
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordError('새 비밀번호 확인이 일치하지 않습니다.')
      return
    }
    setPasswordSaving(true)
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setNewPasswordConfirm('')
      setPasswordMessage('비밀번호가 변경되었습니다.')
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : '비밀번호 변경에 실패했습니다.')
    } finally {
      setPasswordSaving(false)
    }
  }

  const onUnlinkGoogle = async () => {
    setGoogleBusy(true)
    setProfileError(null)
    try {
      await unlinkGoogle()
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Google 연동 해제에 실패했습니다.')
    } finally {
      setGoogleBusy(false)
    }
  }

  const onLogoutAll = async () => {
    setSessionBusy(true)
    try {
      await logoutAll()
      navigate('/login', { replace: true })
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : '모든 기기 로그아웃에 실패했습니다.')
    } finally {
      setSessionBusy(false)
    }
  }

  const metricItems = AUTH_DISABLED
    ? [
        { label: '계정', value: user?.username || '-', hint: user?.department || '부서 미지정', tone: 'info' as const },
        { label: '이메일', value: user?.email || '-', hint: '연락 정보', tone: 'default' as const },
        { label: '인증 모드', value: '비활성화', hint: '로그인 없이 바로 진입', tone: 'warning' as const },
      ]
    : [
        { label: '계정', value: user?.username || '-', hint: user?.department || '부서 미지정', tone: 'info' as const },
        { label: '이메일', value: user?.email || '-', hint: '연락 정보', tone: 'default' as const },
        { label: 'Google 연동', value: user?.google_id ? '연결됨' : '미연결', hint: user?.google_id ? 'SSO 사용 가능' : '수동 로그인', tone: user?.google_id ? 'success' as const : 'warning' as const },
        { label: '세션', value: '활성', hint: '모든 기기 로그아웃 가능', tone: 'default' as const },
      ]

  return (
    <div className="page-container space-y-4">
      <PageHeader
        title="내 프로필"
        subtitle={AUTH_DISABLED ? '현재는 로그인 시스템 없이 기본 사용자 정보만 관리합니다.' : '개인 정보, 비밀번호, 외부 연동, 세션을 한 화면 문법으로 관리합니다.'}
      />

      <PageMetricStrip items={metricItems} />

      <SectionScaffold title="기본 정보" description="사용자 기본 정보를 수정하고 즉시 저장합니다.">
      <form onSubmit={onSubmitProfile} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="form-label text-xs">아이디</label>
            <input value={user?.username || ''} disabled className="form-input bg-[#f5f9ff]" />
          </div>
          <div>
            <label className="form-label text-xs">이름</label>
            <input value={name} onChange={(event) => setName(event.target.value)} className="form-input" />
          </div>
          <div>
            <label className="form-label text-xs">이메일</label>
            <input value={email} onChange={(event) => setEmail(event.target.value)} className="form-input" />
          </div>
          <div>
            <label className="form-label text-xs">부서</label>
            <input value={department} onChange={(event) => setDepartment(event.target.value)} className="form-input" />
          </div>
          <div className="md:col-span-2">
            <label className="form-label text-xs">아바타 URL (선택)</label>
            <input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} className="form-input" />
          </div>
        </div>
        {profileMessage && <p className="text-xs text-green-700">{profileMessage}</p>}
        {profileError && <p className="text-xs text-red-700">{profileError}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={profileSaving} className="primary-btn disabled:opacity-60">
            {profileSaving ? '저장 중...' : '정보 저장'}
          </button>
        </div>
      </form>
      </SectionScaffold>

      {!AUTH_DISABLED ? (
        <SectionScaffold title="비밀번호 변경" description="현재 비밀번호 확인 후 새 비밀번호로 갱신합니다.">
        <form onSubmit={onSubmitPassword} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="form-label text-xs">현재 비밀번호</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label text-xs">새 비밀번호</label>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label text-xs">새 비밀번호 확인</label>
              <input
                type="password"
                value={newPasswordConfirm}
                onChange={(event) => setNewPasswordConfirm(event.target.value)}
                className="form-input"
              />
            </div>
          </div>
          {passwordMessage && <p className="text-xs text-green-700">{passwordMessage}</p>}
          {passwordError && <p className="text-xs text-red-700">{passwordError}</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={passwordSaving} className="primary-btn disabled:opacity-60">
              {passwordSaving ? '변경 중...' : '비밀번호 변경'}
            </button>
          </div>
        </form>
        </SectionScaffold>
      ) : null}

      {!AUTH_DISABLED ? (
        <SectionScaffold title="Google 계정 연동" description="연동 여부를 확인하고 연결 또는 해제를 관리합니다.">
          {user?.google_id ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-[#64748b]">Google 계정이 연동되어 있습니다.</p>
              <button onClick={onUnlinkGoogle} disabled={googleBusy} className="secondary-btn disabled:opacity-60">
                {googleBusy ? '처리 중...' : '연동 해제'}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[#64748b]">Google 계정을 연결할 수 있습니다.</p>
              <GoogleLoginButton
                onSuccess={async (credential) => {
                  setGoogleBusy(true)
                  try {
                    await linkGoogle(credential)
                  } finally {
                    setGoogleBusy(false)
                  }
                }}
                onError={() => {
                  setProfileError('Google 인증 처리에 실패했습니다.')
                }}
                disabled={googleBusy}
              />
            </div>
          )}
        </SectionScaffold>
      ) : null}

      {!AUTH_DISABLED ? (
        <SectionScaffold
          title="세션 관리"
          description="현재 계정의 모든 기기 세션을 즉시 종료합니다."
          actions={
            <button
              onClick={onLogoutAll}
              disabled={sessionBusy}
              className="danger-btn"
            >
              {sessionBusy ? '처리 중...' : '모든 기기에서 로그아웃'}
            </button>
          }
        />
      ) : null}
    </div>
  )
}

