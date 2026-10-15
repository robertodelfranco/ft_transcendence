import type { Language } from "../i18n/languages";

export interface PublicUser {
	id: number;
	username: string;
	avatar_url: string;
	created_at: string;
}

export interface PrivateUser extends PublicUser {
	email: string;
	preferred_language: Language;
	has_password: boolean;
	providers: string[];
}

export interface AuthResponse {
	authenticated: true;
	access_token: string;
	token_type: "bearer";
	expires_in: number;
	user: PrivateUser;
}

// /refresh sem cookie responde 200 {"authenticated": false}, não 401 (auth.md §2.2)
export type RefreshResponse = AuthResponse | { authenticated: false };