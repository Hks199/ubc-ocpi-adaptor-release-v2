import { NextFunction, Request, Response } from 'express';
import { HttpResponse } from '../../../types/responses';
import { AdminResponsePayload } from '../../types/responses';

export default async function handleRequest(
    req: Request,
    res: Response,
    next: NextFunction,
    controller: (req: Request) => Promise<HttpResponse<AdminResponsePayload<any>>>,
) {
    try {
        const response = await controller(req);

        // Strip BigInt values to avoid JSON serialization errors
        const safePayload = JSON.parse(
            JSON.stringify(
                response.payload,
                (_key, value) => (typeof value === 'bigint' ? Number(value) : value),
            ),
        );

        res.status(response.httpStatus || 200).json(safePayload);
        if (response.headers) {
            Object.entries(response.headers).forEach(([key, value]) => {
                res.setHeader(key, value);
            });
        }
    }
    catch (error) {
        next(error);
    }
}