package com.callmeagro.backend.exception;

import com.callmeagro.backend.controller.SatelliteController;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Order(-1)
@RestControllerAdvice(assignableTypes = SatelliteController.class)
public class SatelliteExceptionHandler {
    @ExceptionHandler(SatelliteException.class)
    public ProblemDetail satellite(SatelliteException ex) {
        var problem = ProblemDetail.forStatusAndDetail(ex.getStatusCode(), ex.getReason());
        problem.setProperty("code", ex.code());
        return problem;
    }
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail invalidJson(HttpMessageNotReadableException ex) {
        var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Provide a Polygon boundary, NDVI or NDMI, and valid YYYY-MM-DD dates.");
        problem.setProperty("code", "INVALID_REQUEST");
        return problem;
    }
}
