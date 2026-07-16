import { GOOGLE_REVIEW_TARGET_URL } from "../shared/google-review.js";

export default function handler(_request, response) {
  response.statusCode = 307;
  response.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.setHeader("Location", GOOGLE_REVIEW_TARGET_URL);
  response.end("Redirecionando para a avaliação da Dog City Brasil no Google.");
}
