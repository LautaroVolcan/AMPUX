import { createContext, useContext } from 'react';
import { es, type Dict } from './es';
import { en } from './en';
import type { Language } from '../types';

export const dictionaries: Record<Language, Dict> = { es, en };
export const I18nContext = createContext<Dict>(es);
export const useT = () => useContext(I18nContext);
