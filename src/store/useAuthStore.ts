import {create} from "zustand";

interface AuthStore{
    token: string| null;
    user: {
        name: string;   email: string; }| null;
    setAuth:(token:string, user:AuthStore["user"])=>void;
    logout: ()=> void;
}

export const useAuthStore= create<AuthStore>(
    (set)=>({
        token: null,
        user: null,
        setAuth:(token,user)=> {
            localStorage.setItem("token",token);
            set({token,user});
        },
        logout:()=> {
            localStorage.removeItem("token");
            set({token: null, user: null});
        }
    }));
