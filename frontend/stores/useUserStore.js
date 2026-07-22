import {create} from 'zustand';

const useUserStore = create((set) => ({
    userid: null,
    isinstitution: false,
    username: '',
    fullname: '',
    profile: '',
    hasProfile: false,
    setUserid: (id) => set({ userid: id }),
    setIsinstitution: (v) => set({ isinstitution: v }),
    setUsername: (name) => set({ username: name }),
    setFullname: (name) => set({ fullname: name }),
    setProfile: (url) => set({ profile: url }),
    setHasProfile: (v) => set({ hasProfile: v }),
}));

export default useUserStore;