import { SchemaType } from '@google/generative-ai';

export const AI_RESPONSE_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        bull_case: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        bear_case: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        summary:   { type: SchemaType.STRING },
        quant_analysis: {
            type: SchemaType.OBJECT,
            properties: {
                recommendation:       { type: SchemaType.STRING },
                probability_long:     { type: SchemaType.STRING },
                probability_short:    { type: SchemaType.STRING },
                entry_target:         { type: SchemaType.STRING },
                stop_loss:            { type: SchemaType.STRING },
                take_profit:          { type: SchemaType.STRING },
                take_profit_analysis: { type: SchemaType.STRING },
                micro_trend:          { type: SchemaType.STRING },
                macro_trend:          { type: SchemaType.STRING },
                confidence_level:     { type: SchemaType.STRING },
            },
            required: ['recommendation','probability_long','probability_short','entry_target','stop_loss','take_profit','take_profit_analysis','micro_trend','macro_trend','confidence_level'],
        },
        global_data: {
            type: SchemaType.OBJECT,
            properties: {
                current_status:  { type: SchemaType.STRING },
                future_outlook:  { type: SchemaType.STRING },
                elite_view:      { type: SchemaType.STRING },
                dividend_trend:  { type: SchemaType.STRING },
                sex_appeal:      { type: SchemaType.STRING },
                final_direction: { type: SchemaType.STRING },
            },
            required: ['current_status','future_outlook','elite_view','dividend_trend','sex_appeal','final_direction'],
        },
        radar: {
            type: SchemaType.OBJECT,
            properties: {
                patterns:  { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                scenarios: {
                    type: SchemaType.ARRAY,
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                            name:        { type: SchemaType.STRING },
                            probability: { type: SchemaType.STRING },
                            trigger:     { type: SchemaType.STRING },
                            target:      { type: SchemaType.STRING },
                        },
                        required: ['name','probability','trigger','target'],
                    },
                },
                key_dates: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
            },
            required: ['patterns','scenarios','key_dates'],
        },
        sentiment_score: { type: SchemaType.NUMBER },
    },
    required: ['bull_case','bear_case','summary','quant_analysis','global_data','radar','sentiment_score'],
};
