import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import QRCode from "qrcode";

export default function PixQrCode({ value, className = "" }) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    let active = true;
    const normalizedValue = String(value || "").trim();

    if (!normalizedValue) {
      setDataUrl("");
      return () => {
        active = false;
      };
    }

    QRCode.toDataURL(normalizedValue, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl("");
      });

    return () => {
      active = false;
    };
  }, [value]);

  if (!dataUrl) return null;

  return (
    <img
      src={dataUrl}
      alt="QR Code Pix da cobrança"
      className={`aspect-square bg-white object-contain ${className}`}
    />
  );
}

PixQrCode.propTypes = {
  value: PropTypes.string,
  className: PropTypes.string,
};
