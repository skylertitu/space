import * as functions from 'firebase-functions';
import { FUNCTIONS_REGION } from './config';

export const regionalFunctions = functions.region(FUNCTIONS_REGION);
