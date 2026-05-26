"use client";

import { useCallback, useEffect, useId, useRef } from "react";

const OTP_LEN = 6;

function digitsOnly(raw) {
  return String(raw || "").replace(/\D/g, "").slice(0, OTP_LEN);
}

/**
 * Six-box OTP entry — one string state, mobile autofill, paste, keyboard nav.
 */
export default function RfqOtpInput({
  value = "",
  onChange,
  onComplete,
  disabled = false,
  invalid = false,
  autoFocus = true,
}) {
  const inputId = useId();
  const refs = useRef([]);
  const code = digitsOnly(value);
  const chars = Array.from({ length: OTP_LEN }, (_, i) => code[i] || "");

  const setCode = useCallback(
    (next) => {
      const normalized = digitsOnly(next);
      onChange?.(normalized);
      if (normalized.length === OTP_LEN) {
        onComplete?.(normalized);
      }
    },
    [onChange, onComplete],
  );

  const focusIndex = useCallback((idx) => {
    const el = refs.current[idx];
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  const distributeDigits = useCallback(
    (raw, startIndex = 0) => {
      const d = digitsOnly(raw);
      if (!d) return;
      const current = digitsOnly(value);
      const merged = Array.from({ length: OTP_LEN }, (_, i) => current[i] || "");
      for (let i = 0; i < d.length && startIndex + i < OTP_LEN; i += 1) {
        merged[startIndex + i] = d[i];
      }
      setCode(merged.join(""));
      const nextFocus = Math.min(startIndex + d.length, OTP_LEN - 1);
      focusIndex(nextFocus);
    },
    [value, focusIndex, setCode],
  );

  const handleCellChange = useCallback(
    (index, raw) => {
      const d = digitsOnly(raw);
      const current = digitsOnly(value);
      const cells = Array.from({ length: OTP_LEN }, (_, i) => current[i] || "");
      if (!d) {
        cells[index] = "";
        setCode(cells.join(""));
        return;
      }
      if (d.length > 1) {
        distributeDigits(d, index);
        return;
      }
      cells[index] = d;
      setCode(cells.join(""));
      if (index < OTP_LEN - 1) focusIndex(index + 1);
    },
    [value, distributeDigits, focusIndex, setCode],
  );

  const handleKeyDown = useCallback(
    (index, e) => {
      const current = digitsOnly(value);
      const cells = Array.from({ length: OTP_LEN }, (_, i) => current[i] || "");
      if (e.key === "Backspace") {
        if (cells[index]) {
          cells[index] = "";
          setCode(cells.join(""));
          e.preventDefault();
          return;
        }
        if (index > 0) {
          e.preventDefault();
          cells[index - 1] = "";
          setCode(cells.join(""));
          focusIndex(index - 1);
        }
        return;
      }
      if (e.key === "ArrowLeft" && index > 0) {
        e.preventDefault();
        focusIndex(index - 1);
        return;
      }
      if (e.key === "ArrowRight" && index < OTP_LEN - 1) {
        e.preventDefault();
        focusIndex(index + 1);
      }
    },
    [value, focusIndex, setCode],
  );

  const handlePaste = useCallback(
    (e) => {
      const text = e.clipboardData?.getData("text") || "";
      if (!digitsOnly(text)) return;
      e.preventDefault();
      distributeDigits(text, 0);
    },
    [distributeDigits],
  );

  const handleHiddenAutofill = useCallback(
    (e) => {
      distributeDigits(e.target.value, 0);
    },
    [distributeDigits],
  );

  useEffect(() => {
    if (!autoFocus || disabled) return;
    focusIndex(0);
  }, [autoFocus, disabled, focusIndex]);

  useEffect(() => {
    if (typeof window === "undefined" || disabled) return undefined;
    if (!("OTPCredential" in window)) return undefined;

    const ac = new AbortController();
    void (async () => {
      try {
        const cred = await navigator.credentials.get({
          otp: { transport: ["sms"] },
          signal: ac.signal,
        });
        if (cred?.code) distributeDigits(cred.code, 0);
      } catch {
        /* user dismissed or unsupported */
      }
    })();

    return () => ac.abort();
  }, [disabled, distributeDigits]);

  return (
    <div className="rfq-otp-field">
      <label className="rfq-otp-field__label" htmlFor={`${inputId}-autofill`}>
        Mã OTP
      </label>

      {/* Captures iOS/Android SMS autofill into one code string */}
      <input
        id={`${inputId}-autofill`}
        className="rfq-otp-autofill-capture"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        tabIndex={-1}
        aria-hidden="true"
        value={code}
        onChange={handleHiddenAutofill}
        disabled={disabled}
      />

      <div
        className={`rfq-otp-boxes${invalid ? " rfq-otp-boxes--invalid" : ""}${disabled ? " rfq-otp-boxes--disabled" : ""}`}
        role="group"
        aria-label="Mã OTP 6 số"
        onPaste={handlePaste}
      >
        {chars.map((ch, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="rfq-otp-box"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={6}
            value={ch}
            aria-label={`Số OTP ${i + 1}`}
            aria-invalid={invalid || undefined}
            disabled={disabled}
            onChange={(e) => handleCellChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onFocus={(e) => e.target.select()}
          />
        ))}
      </div>
    </div>
  );
}
