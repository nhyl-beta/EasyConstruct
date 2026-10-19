export interface LoginInput {
  email: string;
  password: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string;
  role: string;
}

export interface OwnerRecoveryInitiateInput {
  targetUserId: number;
}

// What the Owner's fail-safe recovery request reports back. The reset link
// itself is deliberately NOT here: it goes only to the Owner's mailbox.
export interface OwnerRecoveryResult {
  to: string;
  targetUserId: number;
  targetName: string;
  targetEmail: string;
  expiresAt: string;
  createdAt: string;
}
