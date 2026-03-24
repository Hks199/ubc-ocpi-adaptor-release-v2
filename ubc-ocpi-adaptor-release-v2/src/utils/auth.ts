import jwt from 'jsonwebtoken';
import { appConfig } from '../config/app.config';
import { UnauthorizedError } from './errors';
import { logger } from '../services/logger.service';
import GLOBAL_VARS from '../constants/global-vars';
import Utils from './Utils';
import { BecknDomain } from '../ubc/schema/v2.0.0/enums/BecknDomain';
import * as _sodium from "libsodium-wrappers";
import { base64_variants } from "libsodium-wrappers";

export interface JWTPayload {
    email: string;
    company?: string;
    iat?: number;
    exp?: number;
}

export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, appConfig.jwtSecret, {
        expiresIn: appConfig.jwtExpiresIn,
    });
}

export function verifyToken(token: string): JWTPayload {
    try {
        const decoded = jwt.verify(token, appConfig.jwtSecret) as JWTPayload;
        return decoded;
    }
    catch (error:any) {
        logger.error('Error verifying token', error);
        throw new UnauthorizedError('Invalid or expired token');
    }
}

export function extractTokenFromHeader(authHeader?: string): string {
    if (!authHeader) {
        throw new UnauthorizedError('Authorization header is missing');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        throw new UnauthorizedError('Invalid authorization header format');
    }

    return parts[1];
}


const signMessage = async (signingString: string, privateKey: string) => {
    await _sodium.ready;
    const sodium = _sodium;
    const signedMessage = sodium.crypto_sign_detached(
        signingString,
        sodium.from_base64(privateKey, base64_variants.ORIGINAL)
    );
    
    return sodium.to_base64(signedMessage, base64_variants.ORIGINAL);
};



const createSigningString = async (message: string, created?: string, expires?: string) => {
    if (!created) created = Math.floor(new Date().getTime() / 1000 - 1 * 60).toString();
    if (!expires) expires = (parseInt(created, 10) + 1 * 60 * 60).toString();
    await _sodium.ready;
    const sodium = _sodium;
    const digest = sodium.crypto_generichash(64, sodium.from_string(message));
    const digest_base64 = sodium.to_base64(digest, base64_variants.ORIGINAL);
    const signingString = `(created): ${created} (expires): ${expires} digest: BLAKE-512=${digest_base64}`;
    
    return { signingString, expires, created };
};


export async function createAuthorizationHeader (message: any, domain?: BecknDomain) {
    const { signingString, expires, created } = await createSigningString(JSON.stringify(message));
    const signature = await signMessage(signingString, GLOBAL_VARS.PRIVATE_KEY || '');
    const subscriberId = Utils.getSubscriberId(domain);
    const uniqueId = Utils.getUniqueId(domain);
    const header = `Signature keyId="${subscriberId}|${uniqueId}|ed25519",algorithm="ed25519",created="${created}",expires="${expires}",headers="(created) (expires) digest",signature="${signature}"`;
    return header;
}

