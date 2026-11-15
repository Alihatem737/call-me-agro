package com.callmeagro.backend.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;

@RestControllerAdvice
public class ClimateExceptionHandler {
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail invalidJson(HttpMessageNotReadableException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Provide a valid JSON request with numeric coordinates, YYYY-MM-DD dates and comparisonCrops.");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail invalidBody(MethodArgumentNotValidException ex) {
        var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Invalid crop suitability request.");
        problem.setProperty("errors", ex.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage()).sorted().toList());
        return problem;
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ProblemDetail upstream(ResponseStatusException ex) {
        return ProblemDetail.forStatusAndDetail(ex.getStatusCode(), ex.getReason());
    }

    @ExceptionHandler({MissingServletRequestParameterException.class, MethodArgumentTypeMismatchException.class})
    public ProblemDetail invalidInput(Exception ex) {
        if (ex instanceof MethodArgumentTypeMismatchException mismatch
                && ("startDate".equals(mismatch.getName()) || "endDate".equals(mismatch.getName()))
                || ex instanceof MissingServletRequestParameterException missing
                && ("startDate".equals(missing.getParameterName()) || "endDate".equals(missing.getParameterName()))) {
            return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                    "Provide both startDate and endDate as valid YYYY-MM-DD calendar dates.");
        }
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Provide numeric latitude (-90 to 90) and longitude (-180 to 180).");
    }
}
