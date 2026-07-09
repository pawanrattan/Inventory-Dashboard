import { NextResponse } from "next/server";

interface ApiResponse<T=unknown>{
    sucess:boolean;
    message:string;
    data?:T;
    error?:string;
}

export function successResponse<T>(data:T,message:string="Success",status=200):NextResponse<ApiResponse<T>>{
    return NextResponse.json({
        sucess:true,
        message,
        data
    },
{status})
}

export function errorResponse(message="Something went Wrong",status=500,error?:string):NextResponse<ApiResponse>{
    return NextResponse.json({
        sucess:false,
        message,
        error
    },
{status});

}