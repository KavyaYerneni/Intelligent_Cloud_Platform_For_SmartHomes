ALTER TABLE ai_inferences ADD COLUMN input_origin text NOT NULL DEFAULT 'unspecified'
 CHECK (input_origin IN ('unspecified','recorded-dataset','microphone'));
