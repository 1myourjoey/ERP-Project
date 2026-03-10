import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  authGoogleLogin,
  authLogin,
  changePassword,
  clearAuthTokens,
  fetchAuthMe,
  getAccessToken,
  linkGoogle as linkGoogleApi,
  logoutAllDevices,
  registerUser,
  registerWithInvite,
  refreshAuthToken,
  setAuthTokens,
  unlinkGoogle as unlinkGoogleApi,
  updateMyProfile,
  type ProfileUpdateRequestInput,
  type RegisterRequestInput,
  type RegisterResponse,
  type UserResponse,
  type UserRole,
} from '../lib/api'
import { AUTH_DISABLED } from '../lib/authMode'

export interface AuthUser {
  id: number
  username: string
  email: string | null
  name: string
  role: UserRole
  department: string | null
  avatar_url: string | null
  google_id: string | null
  allowed_routes: string[] | null
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  isMaster: boolean
  login: (loginId: string, password: string) => Promise<void>
  loginWithGoogle: (credential: string) => Promise<void>
  loginWithInvite: (token: string, username: string, password: string, name?: string) => Promise<void>
  register: (data: RegisterRequestInput) => Promise<RegisterResponse>
  logout: () => void
  hasAccess: (routeKey: string) => boolean
  changePassword: (currentPw: string, newPw: string) => Promise<void>
  updateProfile: (data: ProfileUpdateRequestInput) => Promise<void>
  linkGoogle: (credential: string) => Promise<void>
  unlinkGoogle: () => Promise<void>
  logoutAll: () => Promise<void>
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null
  if (email.endsWith('@local.invalid')) return null
  return email
}

function toAuthUser(user: UserResponse): AuthUser {
  return {
    id: user.id,
    username: user.username,
    email: normalizeEmail(user.email),
    name: user.name,
    role: user.role,
    department: user.department ?? null,
    avatar_url: user.avatar_url ?? null,
    google_id: user.google_id ?? null,
    allowed_routes: user.allowed_routes ?? null,
  }
}

const AUTH_DISABLED_FALLBACK_USER: AuthUser = {
  id: 0,
  username: 'system',
  email: null,
  name: 'System User',
  role: 'master',
  department: 'SYSTEM',
  avatar_url: null,
  google_id: null,
  allowed_routes: null,
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(() =>
    AUTH_DISABLED ? 'auth-disabled' : getAccessToken(),
  )
  const [isLoading, setIsLoading] = useState(true)

  const applyLogin = useCallback((payload: { access_token: string; refresh_token: string; user: UserResponse }) => {
    setAuthTokens(payload.access_token, payload.refresh_token)
    setToken(payload.access_token)
    setUser(toAuthUser(payload.user))
  }, [])

  useEffect(() => {
    let mounted = true
    const bootstrap = async () => {
      if (AUTH_DISABLED) {
        if (mounted) {
          setToken('auth-disabled')
          setUser(AUTH_DISABLED_FALLBACK_USER)
          setIsLoading(false)
        }
        return
      }

      const access = getAccessToken()
      if (!access) {
        if (mounted) {
          setToken(null)
          setUser(null)
          setIsLoading(false)
        }
        return
      }

      try {
        const me = await fetchAuthMe()
        if (!mounted) return
        setToken(access)
        setUser(toAuthUser(me))
      } catch {
        const refreshed = await refreshAuthToken()
        if (!mounted) return
        if (refreshed) {
          setToken(refreshed.access_token)
          setUser(toAuthUser(refreshed.user))
        } else {
          clearAuthTokens()
          setToken(null)
          setUser(null)
        }
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    void bootstrap()
    return () => {
      mounted = false
    }
  }, [])

  const login = useCallback(
    async (loginId: string, password: string) => {
      if (AUTH_DISABLED) {
        setToken('auth-disabled')
        setUser(AUTH_DISABLED_FALLBACK_USER)
        return
      }
      const payload = await authLogin({ login_id: loginId, password })
      applyLogin(payload)
    },
    [applyLogin],
  )

  const loginWithGoogle = useCallback(
    async (credential: string) => {
      if (AUTH_DISABLED) {
        setToken('auth-disabled')
        setUser(AUTH_DISABLED_FALLBACK_USER)
        return
      }
      const payload = await authGoogleLogin({ credential })
      applyLogin(payload)
    },
    [applyLogin],
  )

  const loginWithInvite = useCallback(
    async (tokenValue: string, username: string, password: string, name?: string) => {
      if (AUTH_DISABLED) {
        setToken('auth-disabled')
        setUser(AUTH_DISABLED_FALLBACK_USER)
        return
      }
      const payload = await registerWithInvite({
        token: tokenValue,
        username,
        password,
        name: name?.trim() || null,
      })
      applyLogin(payload)
    },
    [applyLogin],
  )

  const register = useCallback(async (data: RegisterRequestInput) => {
    return registerUser(data)
  }, [])

  const logout = useCallback(() => {
    if (AUTH_DISABLED) {
      return
    }
    clearAuthTokens()
    setToken(null)
    setUser(null)
  }, [])

  const refreshMe = useCallback(async () => {
    const me = await fetchAuthMe()
    setUser(toAuthUser(me))
  }, [])

  const hasAccess = useCallback(
    (routeKey: string) => {
      if (!user) return false
      if (routeKey === '/dashboard') return true
      if (routeKey === '/users') return user.role === 'master'
      if (user.role === 'master' || user.role === 'admin') return true
      if (user.allowed_routes == null) return true
      return user.allowed_routes.includes(routeKey)
    },
    [user],
  )

  const changePasswordAction = useCallback(
    async (currentPw: string, newPw: string) => {
      await changePassword({ current_password: currentPw, new_password: newPw })
    },
    [],
  )

  const updateProfileAction = useCallback(async (data: ProfileUpdateRequestInput) => {
    const me = await updateMyProfile(data)
    setUser(toAuthUser(me))
  }, [])

  const linkGoogleAction = useCallback(async (credential: string) => {
    const me = await linkGoogleApi({ credential })
    setUser(toAuthUser(me))
  }, [])

  const unlinkGoogleAction = useCallback(async () => {
    const me = await unlinkGoogleApi()
    setUser(toAuthUser(me))
  }, [])

  const logoutAllAction = useCallback(async () => {
    if (AUTH_DISABLED) {
      return
    }
    await logoutAllDevices()
    clearAuthTokens()
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: AUTH_DISABLED ? Boolean(user) : Boolean(user && token),
      isMaster: user?.role === 'master',
      login,
      loginWithGoogle,
      loginWithInvite,
      register,
      logout,
      hasAccess,
      changePassword: changePasswordAction,
      updateProfile: updateProfileAction,
      linkGoogle: linkGoogleAction,
      unlinkGoogle: unlinkGoogleAction,
      logoutAll: logoutAllAction,
      refreshMe,
    }),
    [
      changePasswordAction,
      hasAccess,
      isLoading,
      linkGoogleAction,
      login,
      loginWithGoogle,
      loginWithInvite,
      logout,
      logoutAllAction,
      refreshMe,
      register,
      token,
      unlinkGoogleAction,
      updateProfileAction,
      user,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
