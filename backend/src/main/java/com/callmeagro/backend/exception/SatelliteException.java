package com.callmeagro.backend.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public class SatelliteException extends ResponseStatusException {
    private final String code;
    public SatelliteException(HttpStatus status, String code, String detail) {
        super(status, detail);
        this.code = code;
    }
    public String code() { return code; }
}
