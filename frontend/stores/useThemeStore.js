import {create} from 'zustand';

const useThemeStore = create((set) => ({
    primaryColor: "#5b4fcf",
    secondaryColor: "#0f69dfff",
}));

export default useThemeStore;
