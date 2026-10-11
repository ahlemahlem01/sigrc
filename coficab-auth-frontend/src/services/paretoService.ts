import axios from 'axios';
import {
  ParetoItemDto,
  ParetoRequestDto,
  ParetoSuggestRequestDto,
  ParetoSuggestionDto,
} from '../types/pareto.types';

import { ACTION_PLAN_API_URL as API_BASE_URL } from '../config/apiEnv';

const authHeaders = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export const paretoService = {
  async getPareto(request: ParetoRequestDto, token: string): Promise<ParetoItemDto[]> {
    const response = await axios.post<ParetoItemDto[]>(`${API_BASE_URL}/pareto`, request, authHeaders(token));
    return response.data;
  },

  async getSuggestion(request: ParetoSuggestRequestDto, token: string): Promise<ParetoSuggestionDto> {
    const response = await axios.post<ParetoSuggestionDto>(`${API_BASE_URL}/pareto/suggest`, request, authHeaders(token));
    return response.data;
  },
};
